/**
 * The protobuf codec and the gRPC-Web framing, against known byte sequences.
 *
 * These are the parts with no type checker and no schema behind them: a field
 * number or a shift width that is quietly wrong produces a plausible-looking
 * value rather than an error, and the first symptom is an unrelated game marked
 * as owned. So the cases here are byte sequences with a known meaning, several
 * of them captured verbatim off the live Retrom 0.8.4 instance.
 */

import { describe, expect, it, vi } from "vitest";

import {
  ProtoError,
  boolField,
  concatBytes,
  decodeMessage,
  encodeVarint,
  packedVarints,
  readInt,
  readMessage,
  readMessages,
  readString,
  readTimestamp,
  varintField,
} from "$lib/library/retrom-proto.js";
import {
  GrpcError,
  frameRequest,
  parseResponseBody,
  parseTrailers,
} from "$lib/library/retrom-grpcweb.js";

/** Hex string -> Uint8Array, so the tests read like a wire dump. */
function bytes(hex) {
  return Uint8Array.from(
    hex.match(/../g).map((pair) => Number.parseInt(pair, 16)),
  );
}

function hex(array) {
  return [...array].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("varint encoding", () => {
  it("encodes a single-byte value", () => {
    expect(encodeVarint(0)).toEqual([0x00]);
    expect(encodeVarint(1)).toEqual([0x01]);
    expect(encodeVarint(127)).toEqual([0x7f]);
  });

  it("encodes a multi-byte value little-endian base 128", () => {
    // 300 = 0b100101100 -> 0xac 0x02
    expect(encodeVarint(300)).toEqual([0xac, 0x02]);
  });

  it("sign-extends a negative value to ten bytes, as protobuf does", () => {
    const encoded = encodeVarint(-1);
    expect(encoded).toHaveLength(10);
    expect(encoded[9]).toBe(0x01);
  });

  it("round-trips a value above 2^32, where a 32-bit shift would corrupt it", () => {
    // The exact trap the codec exists to avoid: `1 << 35` is 8 in JavaScript.
    const value = 2 ** 35 + 12345;
    const fields = decodeMessage(varintField(1, value));

    expect(readInt(fields, 1)).toBe(value);
  });

  it("round-trips an IGDB-sized id above 2^53 boundary safely or refuses it", () => {
    // igdb_id is int64. Values this large do not occur, but a codec that
    // silently rounded one would be worse than one that refuses.
    const encoded = varintField(1, Number.MAX_SAFE_INTEGER);
    expect(readInt(decodeMessage(encoded), 1)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("round-trips a negative value through the two's complement rule", () => {
    expect(readInt(decodeMessage(varintField(1, -42)), 1)).toBe(-42);
  });
});

describe("message decoding", () => {
  it("decodes a varint field", () => {
    // field 1, wire type 0, value 1
    expect(readInt(decodeMessage(bytes("0801")), 1)).toBe(1);
  });

  it("decodes a length-delimited string field", () => {
    // field 3, wire type 2, len 3, "abc"
    expect(readString(decodeMessage(bytes("1a03616263")), 3)).toBe("abc");
  });

  it("keeps every occurrence of a repeated field", () => {
    const fields = decodeMessage(
      concatBytes(varintField(1, 7), varintField(1, 9)),
    );
    // Stored as BigInt: decoding never narrows, so that a field this codec will
    // never read cannot be refused for its magnitude. readInt narrows.
    expect(fields.get(1)).toEqual([7n, 9n]);
    // Protobuf's rule for a repeated scalar in a singular field: last wins.
    expect(readInt(fields, 1)).toBe(9);
  });

  it("skips a field it does not know rather than failing", () => {
    // field 1 = 5, then an unknown field 99 (wire type 2), then field 2 = 6.
    const message = concatBytes(
      varintField(1, 5),
      Uint8Array.from([0x9a, 0x06, 0x02, 0xff, 0xfe]),
      varintField(2, 6),
    );
    const fields = decodeMessage(message);

    expect(readInt(fields, 1)).toBe(5);
    expect(readInt(fields, 2)).toBe(6);
  });

  it("refuses field number 0", () => {
    expect(() => decodeMessage(bytes("0001"))).toThrow(ProtoError);
  });

  it("refuses a truncated varint", () => {
    expect(() => decodeMessage(bytes("08ff"))).toThrow(ProtoError);
  });

  it("refuses a varint longer than the ten bytes 64 bits can need", () => {
    // Eleven continuation bytes. Without the cap this walks off into whatever
    // follows, so the ceiling is what stops a corrupt buffer running.
    expect(() => decodeMessage(bytes(`08${"ff".repeat(10)}01`))).toThrow(
      /longer than 64 bits/,
    );
  });

  it("refuses a length that runs past the end of the message", () => {
    // field 3, wire type 2, claims 40 bytes, supplies 2.
    expect(() => decodeMessage(bytes("1a28abcd"))).toThrow(ProtoError);
  });

  it("refuses a group wire type, which cannot be skipped safely", () => {
    // field 1, wire type 3 (group start): length is unknowable.
    expect(() => decodeMessage(bytes("0b"))).toThrow(ProtoError);
  });

  it("returns the fallback for a field that is absent or the wrong shape", () => {
    const fields = decodeMessage(bytes("0801"));
    expect(readInt(fields, 9, "gone")).toBe("gone");
    // Field 1 is a varint, so asking for a string must not reinterpret it.
    expect(readString(fields, 1, null)).toBeNull();
  });

  it("drops an undecodable nested message instead of throwing", () => {
    // field 1 carries 2 bytes that are not a valid message (field number 0).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fields = decodeMessage(bytes("0a0200010a020801"));
    const messages = readMessages(fields, 1);

    expect(messages).toHaveLength(1);
    expect(readInt(messages[0], 1)).toBe(1);
    // Dropped, but never in silence: a record that vanishes from a sync without
    // a word still lets the pass complete, and a completed pass is what lets
    // the index sweep mark the missing entry removed.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("packs a repeated int32 and reads it back", () => {
    const fields = decodeMessage(packedVarints(1, [2, 300, 4]));
    const packed = fields.get(1)[0];
    expect(hex(packed)).toBe("02ac0204");
  });

  it("encodes an empty repeated field as nothing, which means 'no filter'", () => {
    expect(packedVarints(1, [])).toHaveLength(0);
  });

  it("encodes a bool as a varint 1 or 0", () => {
    expect(hex(boolField(3, true))).toBe("1801");
    expect(hex(boolField(3, false))).toBe("1800");
  });
});

describe("the fixed-width wire types", () => {
  it("decodes a 32-bit field little-endian and unsigned", () => {
    // field 1, wire type 5, 0x12345678 little-endian.
    expect(readInt(decodeMessage(bytes("0d78563412")), 1)).toBe(0x12345678);
  });

  it("does not sign-extend a 32-bit field with the high bit set", () => {
    // 0xffffffff is 4294967295, not -1: fixed32 carries no sign of its own,
    // and the shift that assembles it must not introduce one.
    expect(readInt(decodeMessage(bytes("0dffffffff")), 1)).toBe(4294967295);
  });

  it("decodes a 64-bit field little-endian", () => {
    // field 1, wire type 1, 65536 little-endian.
    expect(readInt(decodeMessage(bytes("090000010000000000")), 1)).toBe(65536);
  });

  it("refuses a truncated 64-bit field", () => {
    expect(() => decodeMessage(bytes("09010203"))).toThrow(/truncated 64-bit/);
  });

  it("refuses a truncated 32-bit field", () => {
    expect(() => decodeMessage(bytes("0d0102"))).toThrow(/truncated 32-bit/);
  });

  it("steps over an unknown double without losing the record around it", () => {
    // The regression this codec's contract turns on. Retrom's schema already
    // uses `double` elsewhere (InstallationProgress.bytes_per_second), so a
    // later release adding one to Game is an ordinary event. Its bit pattern is
    // not an integer and is far outside JavaScript's exact range; narrowing it
    // while decoding would throw, and a nested record that throws is dropped in
    // silence and then swept out of the index.
    //
    // field 1 = 1, field 20 wire type 1 = 1234.5 as IEEE754, field 3 = "abc".
    const message = bytes("0801a10100000000004a93401a03616263");
    const fields = decodeMessage(message);

    expect(readInt(fields, 1)).toBe(1);
    expect(readString(fields, 3)).toBe("abc");
  });

  it("decodes a value too large to represent, and refuses only when read", () => {
    // The split that makes the case above work: decodeMessage stores, readInt
    // judges. A caller that asks for this field gets an error rather than a
    // rounded number, because a rounded igdb_id is a wrong igdb_id.
    const fields = decodeMessage(varintField(7, 2n ** 60n));

    expect(fields.get(7)).toEqual([2n ** 60n]);
    expect(() => readInt(fields, 7)).toThrow(ProtoError);
  });
});

describe("timestamps", () => {
  it("decodes a google.protobuf.Timestamp into a Date", () => {
    // Captured from the live instance: Game.created_at for game 1.
    // field 5, len 12, {seconds: 1785416681, nanos: 989282000}
    const fields = decodeMessage(bytes("2a0c08e997add30610d0fddcd703"));
    const timestamp = readTimestamp(fields, 5);

    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.toISOString()).toBe("2026-07-30T13:04:41.989Z");
  });

  it("returns null for an absent timestamp", () => {
    expect(readTimestamp(decodeMessage(bytes("0801")), 5)).toBeNull();
  });
});

describe("the live Game record, decoded field by field", () => {
  // Verbatim from GetGamesResponse.games[0] on the live Retrom 0.8.4.
  const GAME = bytes(
    "08011a242f6170702f646174612f6c6962726172792f6e65732f70726f6f662d7365" +
      "65642e6e657320022a0c08e997add30610d0fddcd703320c08e997add30610d0fddcd703",
  );

  it("reads id, path and platform_id at the documented field numbers", () => {
    const game = decodeMessage(GAME);

    expect(readInt(game, 1)).toBe(1);
    expect(readString(game, 3)).toBe("/app/data/library/nes/proof-seed.nes");
    expect(readInt(game, 4)).toBe(2);
  });

  it("reads created_at at field 5 and updated_at at field 6", () => {
    const game = decodeMessage(GAME);

    expect(readTimestamp(game, 5).toISOString()).toBe(
      "2026-07-30T13:04:41.989Z",
    );
    expect(readTimestamp(game, 6).toISOString()).toBe(
      "2026-07-30T13:04:41.989Z",
    );
  });

  it("reports no is_deleted, so the record is live", () => {
    expect(readInt(decodeMessage(GAME), 8, 0)).toBe(0);
  });
});

describe("the live GameMetadata record", () => {
  // Verbatim from GetGamesResponse.metadata[0] on the live instance.
  const META = bytes(
    "0803121e524f4d204875622070726f6f66206d6174726978202872656e616d656429" +
      "223c687474703a2f2f3132372e302e302e313a353130322f726573742f7075626c69" +
      "632f726f6d2d6875622f636f766572732f636f7665722d332e706e67420c089698ad" +
      "d3061098b9ab99034a0c089698add30610989aa3ad03",
  );

  it("reads game_id, name and cover_url", () => {
    const meta = decodeMessage(META);

    expect(readInt(meta, 1)).toBe(3);
    expect(readString(meta, 2)).toBe("ROM Hub proof matrix (renamed)");
    expect(readString(meta, 4)).toBe(
      "http://127.0.0.1:5102/rest/public/rom-hub/covers/cover-3.png",
    );
  });

  it("reports no igdb_id, because this record genuinely has none", () => {
    // The case that must produce null rather than a guess.
    expect(readInt(decodeMessage(META), 7)).toBeNull();
  });
});

describe("gRPC-Web framing", () => {
  it("prefixes a request with a flag byte and a big-endian length", () => {
    expect(hex(frameRequest(bytes("0801")))).toBe("00000000020801");
  });

  it("frames an empty request as five zero bytes", () => {
    expect(hex(frameRequest(new Uint8Array(0)))).toBe("0000000000");
  });

  it("splits a response into its message and its trailers", () => {
    // Captured shape: one data frame, then a trailer frame with 0x80 set.
    const body = concatBytes(
      bytes("00000000080a060a0410081804"),
      bytes("800000000f"),
      new TextEncoder().encode("grpc-status:0\r\n"),
    );
    const { message, trailers, compressed } = parseResponseBody(body);

    expect(hex(message)).toBe("0a060a0410081804");
    expect(trailers["grpc-status"]).toBe("0");
    expect(compressed).toBe(false);
  });

  it("reports a data frame whose flag byte claims a compressed body", () => {
    // Bit 0x01. Nothing here can inflate it, so the caller must refuse rather
    // than hand the bytes to the protobuf decoder and report what comes out.
    const body = concatBytes(
      bytes("01000000021f8b"),
      bytes("800000000f"),
      new TextEncoder().encode("grpc-status:0\r\n"),
    );

    expect(parseResponseBody(body).compressed).toBe(true);
  });

  it("decodes the captured GetServerInfo message as version 0.8.4", () => {
    const response = decodeMessage(bytes("0a060a0410081804"));
    const info = readMessage(response, 1);
    const version = readMessage(info, 1);

    expect([1, 2, 3].map((f) => readInt(version, f, 0)).join(".")).toBe(
      "0.8.4",
    );
  });

  it("stops at a truncated frame rather than throwing", () => {
    // A frame claiming 16 bytes with 2 supplied: no message, no trailers.
    const { message, trailers } = parseResponseBody(bytes("0000000010abcd"));

    expect(message).toHaveLength(0);
    expect(trailers["grpc-status"]).toBeUndefined();
  });

  it("lowercases trailer names and tolerates blank lines", () => {
    const trailers = parseTrailers(
      new TextEncoder().encode(
        "Grpc-Status: 5\r\nGrpc-Message: not found\r\n\r\n",
      ),
    );

    expect(trailers["grpc-status"]).toBe("5");
    expect(trailers["grpc-message"]).toBe("not found");
  });

  it("names the gRPC status rather than reporting a bare number", () => {
    expect(
      new GrpcError("retrom.GameService/GetGames", 12, "nope").message,
    ).toContain("UNIMPLEMENTED");
  });
});
