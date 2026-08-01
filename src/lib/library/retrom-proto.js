/**
 * Just enough protobuf wire format to read Retrom, and nothing more.
 *
 * ## Why this exists instead of a dependency
 *
 * Retrom has no REST listing API. `packages/rest-service` mounts only
 * `/rest/file/{id}`, `/rest/game/{id}` and a static `/rest/public/*`, so every
 * call this backend needs -- GetPlatforms, GetGames, GetServerInfo -- lives on
 * a gRPC service and speaks protobuf. This project has no protobuf library and
 * adding one (`protobufjs`, `@bufbuild/protobuf`) would put a parser and a
 * megabyte of descriptor tables into every install, including the ones that
 * never select this backend, to read about fifteen scalar fields.
 *
 * The wire format itself is small, frozen and public. What is implemented here
 * is the subset those fields use: varints, length-delimited values, and the
 * rules needed to survive a server that knows more fields than this file does.
 *
 * ## The three rules that matter
 *
 * **Unknown fields are skipped, not rejected.** `decodeMessage` returns
 * whatever it was given, keyed by field number, and steps over anything it does
 * not recognise. A Retrom release that adds a field to `Game` must not break a
 * sync.
 *
 * **Nothing here knows what a message means.** `decodeMessage` yields
 * `Map<fieldNumber, values[]>` -- no schema, no required fields, no descriptor.
 * The meaning lives in retrom.js beside the field number it was read from, so a
 * number and its name are never far apart.
 *
 * **Integers are carried as BigInt and narrowed only when read.** JavaScript's
 * bitwise operators coerce to *signed 32-bit*, so the obvious `result |= (byte
 * & 0x7f) << shift` silently corrupts every value above 2^31 -- which on this
 * API means `GameFile.byte_size` (int64) for any file over 2GB, and
 * `GameMetadata.igdb_id` (int64). A wrong igdb_id marks an unrelated game as
 * owned, so this is precisely the field that must not be quietly mangled.
 *
 * Where that narrowing happens is load-bearing, and it is `readInt` rather than
 * `decodeMessage`. Decoding has to be able to walk past a field it will never
 * read: a `double` that a later Retrom adds to `Game` is eight bytes whose bit
 * pattern is nobody's integer, and refusing to represent it while decoding
 * would throw out the whole enclosing record -- silently, because a nested
 * record that will not decode is dropped rather than propagated. So
 * `decodeMessage` only stores, and `readInt` refuses at the point a caller asks
 * for a value it cannot represent exactly. Out of range is still an error and
 * never a rounded number.
 *
 * Field numbers used by the backend are cited in retrom.js against the
 * descriptors recovered from the running server's own client bundle
 * (`@retrom/codegen`, Retrom 0.8.4).
 */

/** Wire types. Groups (3, 4) were removed in proto3 and are rejected. */
const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LEN = 2;
const WIRE_FIXED32 = 5;

const TWO_POW_63 = 1n << 63n;
const TWO_POW_64 = 1n << 64n;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/** UTF-8 with replacement characters: a mangled name is better than a throw. */
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

/**
 * A payload that is not decodable protobuf.
 *
 * Callers turn this into "skip this record" rather than "abandon the sync",
 * which is why it is a distinct type.
 */
export class ProtoError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProtoError";
  }
}

// -- encoding ---------------------------------------------------------------

/**
 * Base-128 varint, as protobuf writes an unsigned integer.
 *
 * Negative values are sign-extended to 64 bits first, which is what protobuf
 * does for a negative int32/int64 -- ten bytes, not an error. Nothing this
 * backend sends is negative, but a codec that emitted something else for one
 * would be a trap for the next person.
 *
 * @param {number|bigint} value - Integer to encode
 * @returns {number[]} - Varint bytes
 */
export function encodeVarint(value) {
  let remaining = BigInt(value);
  if (remaining < 0n) remaining += TWO_POW_64;

  const out = [];
  for (;;) {
    const chunk = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining > 0n) {
      out.push(chunk | 0x80);
    } else {
      out.push(chunk);
      return out;
    }
  }
}

function tagBytes(field, wireType) {
  return encodeVarint((field << 3) | wireType);
}

/** One int32/int64/enum field. */
export function varintField(field, value) {
  return Uint8Array.from([
    ...tagBytes(field, WIRE_VARINT),
    ...encodeVarint(value),
  ]);
}

/** One bool field. */
export function boolField(field, value) {
  return varintField(field, value ? 1 : 0);
}

/** One length-delimited field: bytes, string, or an embedded message. */
export function bytesField(field, value) {
  return Uint8Array.from([
    ...tagBytes(field, WIRE_LEN),
    ...encodeVarint(value.length),
    ...value,
  ]);
}

/** One string field. */
export function stringField(field, value) {
  return bytesField(field, encoder.encode(String(value)));
}

/**
 * A `repeated int32` field, packed -- proto3's default encoding.
 *
 * An empty list encodes to nothing at all, which is correct and load-bearing:
 * proto3 cannot distinguish an empty repeated field from an absent one, and
 * Retrom's handlers read `ids.is_empty()` as "no filter". So
 * `packedVarints(1, [])` means "every platform", not "no platforms".
 *
 * @param {number} field - Field number
 * @param {Array<number>} values - Values to pack
 * @returns {Uint8Array}
 */
export function packedVarints(field, values) {
  if (!values || values.length === 0) return new Uint8Array(0);
  const body = [];
  for (const value of values) body.push(...encodeVarint(value));
  return bytesField(field, Uint8Array.from(body));
}

/** Join encoded fields into one message body. */
export function concatBytes(...parts) {
  let total = 0;
  for (const part of parts) total += part.length;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// -- decoding ---------------------------------------------------------------

/**
 * Read one base-128 varint.
 *
 * Accumulates in BigInt. See the module docstring: `<<` on a Number is a
 * 32-bit signed shift and corrupts anything wider.
 *
 * Ten bytes is the ceiling, because sixty-four bits need at most ten groups of
 * seven. An eleventh continuation byte is a malformed message rather than a
 * very large number, and reading on would let a corrupt buffer run.
 *
 * @param {Uint8Array} bytes - Buffer to read from
 * @param {number} offset - Where to start
 * @returns {[bigint, number]} - The value and the offset just past it
 * @throws {ProtoError} On a truncated or over-long varint
 */
function readVarint(bytes, offset) {
  let value = 0n;
  let shift = 0n;
  let consumed = 0;

  for (;;) {
    if (offset >= bytes.length) {
      throw new ProtoError("truncated varint at end of message");
    }
    if (consumed === 10) {
      throw new ProtoError("varint longer than 64 bits");
    }

    const byte = bytes[offset];
    offset += 1;
    consumed += 1;
    value |= BigInt(byte & 0x7f) << shift;
    shift += 7n;

    if ((byte & 0x80) === 0) return [value, offset];
  }
}

/**
 * Decode one protobuf message into `Map<fieldNumber, values[]>`.
 *
 * Integer fields decode to BigInt and are narrowed later by `readInt`;
 * length-delimited fields stay as Uint8Array and are interpreted by the caller,
 * which is the only layer that knows whether they are a string or a nested
 * message. Nothing here rejects a value for its magnitude: this function's one
 * job is to reach the end of the buffer, and a field it will never read must
 * not be able to stop it.
 *
 * Every field is an array because `repeated` is not visible on the wire: a
 * field that appears once and one that appears many times encode identically,
 * and guessing wrong in either direction loses data.
 *
 * @param {Uint8Array} bytes - One serialized message
 * @returns {Map<number, Array<bigint|Uint8Array>>}
 * @throws {ProtoError} When the bytes are not decodable
 */
export function decodeMessage(bytes) {
  const fields = new Map();
  let offset = 0;

  while (offset < bytes.length) {
    const [key, afterKey] = readVarint(bytes, offset);
    offset = afterKey;

    const field = Number(key >> 3n);
    const wireType = Number(key & 7n);
    if (field === 0) throw new ProtoError("field number 0 is not valid");

    let value;
    if (wireType === WIRE_VARINT) {
      const [raw, next] = readVarint(bytes, offset);
      // Two's complement, applied here rather than at read time because it is a
      // property of the wire type and not of the caller. Every integer field in
      // Retrom's schema is signed (`Game.id` int32, `GameFile.byte_size` int64,
      // `GameMetadata.igdb_id` int64) and protobuf writes a negative one
      // sign-extended to sixty-four bits. A genuine uint64 above 2^63 would be
      // misread, and Retrom's schema has none.
      value = raw >= TWO_POW_63 ? raw - TWO_POW_64 : raw;
      offset = next;
    } else if (wireType === WIRE_LEN) {
      const [rawLength, next] = readVarint(bytes, offset);
      const length = Number(rawLength);
      const end = next + length;
      if (end > bytes.length) {
        throw new ProtoError(
          `length-delimited field ${field} claims ${length} bytes but only ` +
            `${bytes.length - next} remain`,
        );
      }
      value = bytes.subarray(next, end);
      offset = end;
    } else if (wireType === WIRE_FIXED64) {
      if (offset + 8 > bytes.length) {
        throw new ProtoError(`truncated 64-bit field ${field}`);
      }
      // Kept as the raw unsigned sixty-four-bit pattern, deliberately
      // uninterpreted. This backend reads no fixed-width field, and the ones
      // Retrom's schema already carries elsewhere are `double` -- a bit pattern
      // that is nobody's integer. Stepping over it is the whole requirement, so
      // that the fields on either side of it survive.
      let acc = 0n;
      for (let i = 7; i >= 0; i -= 1) {
        acc = (acc << 8n) | BigInt(bytes[offset + i]);
      }
      value = acc;
      offset += 8;
    } else if (wireType === WIRE_FIXED32) {
      if (offset + 4 > bytes.length) {
        throw new ProtoError(`truncated 32-bit field ${field}`);
      }
      value =
        BigInt(bytes[offset]) |
        (BigInt(bytes[offset + 1]) << 8n) |
        (BigInt(bytes[offset + 2]) << 16n) |
        (BigInt(bytes[offset + 3]) << 24n);
      offset += 4;
    } else {
      // There is no way to know how long an unknown wire type is, so the walk
      // cannot continue past it.
      throw new ProtoError(
        `field ${field} has unsupported wire type ${wireType}; the rest of ` +
          "the message cannot be skipped safely",
      );
    }

    const existing = fields.get(field);
    if (existing) existing.push(value);
    else fields.set(field, [value]);
  }

  return fields;
}

// -- reading decoded fields -------------------------------------------------
//
// Each of these answers "what is field N, if it is there at all", and returns a
// fallback rather than throwing when the field is absent or the wrong shape: a
// field Retrom did not send is the normal case for every proto3 optional in its
// schema, and a missing field must never be confused with a wrong one.
//
// The one thing they will not do is answer approximately. readInt throws for a
// value it cannot represent exactly, because reaching readInt means a caller
// does care about that field.

/**
 * The last integer value of a field, or a fallback.
 *
 * Last, not first, because protobuf's own rule for a repeated scalar in a
 * non-repeated field is that the last one wins.
 *
 * Out of JavaScript's exact integer range throws rather than returning an
 * approximation: a rounded igdb_id is a wrong igdb_id, and a wrong one marks
 * unrelated games as owned. Callers that walk a listing catch this per record,
 * so one impossible value costs that record rather than the pass.
 *
 * @param {Map<number, Array>} fields - A decoded message
 * @param {number} field - Field number
 * @param {*} [fallback] - Returned when absent or not an integer field
 * @returns {number|*}
 * @throws {ProtoError} When the value cannot be represented exactly
 */
export function readInt(fields, field, fallback = null) {
  const values = fields.get(field);
  if (!values || values.length === 0) return fallback;

  const value = values[values.length - 1];
  if (typeof value !== "bigint") return fallback;

  if (value > MAX_SAFE || value < MIN_SAFE) {
    throw new ProtoError(
      `field ${field} is ${value}, which cannot be represented exactly as a ` +
        "JavaScript number",
    );
  }
  return Number(value);
}

/**
 * The last string value of a field, or a fallback.
 *
 * @param {Map<number, Array>} fields - A decoded message
 * @param {number} field - Field number
 * @param {*} [fallback] - Returned when absent or not length-delimited
 * @returns {string|*}
 */
export function readString(fields, field, fallback = null) {
  const values = fields.get(field);
  if (!values || values.length === 0) return fallback;

  const value = values[values.length - 1];
  if (!(value instanceof Uint8Array)) return fallback;
  return decoder.decode(value);
}

/**
 * Every occurrence of a field, decoded as a nested message.
 *
 * An occurrence that will not decode is dropped rather than thrown: one
 * malformed row in a listing of a thousand should cost that row, not the sync.
 *
 * It is not dropped quietly, though. A record that disappears from an
 * enumeration without a word is worse than one that fails it: the pass still
 * completes, and a completed pass is exactly what lets the index sweep mark
 * every entry it did not see as removed.
 *
 * @param {Map<number, Array>} fields - A decoded message
 * @param {number} field - Field number
 * @returns {Array<Map<number, Array>>}
 */
export function readMessages(fields, field) {
  const out = [];
  for (const value of fields.get(field) ?? []) {
    if (!(value instanceof Uint8Array)) continue;
    try {
      out.push(decodeMessage(value));
    } catch (error) {
      console.warn(
        `Dropping an undecodable Retrom record in field ${field}: ${error.message}`,
      );
    }
  }
  return out;
}

/**
 * The last occurrence of a field as a nested message, or null.
 *
 * @param {Map<number, Array>} fields - A decoded message
 * @param {number} field - Field number
 * @returns {Map<number, Array>|null}
 */
export function readMessage(fields, field) {
  const messages = readMessages(fields, field);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

/**
 * A `google.protobuf.Timestamp` field as a Date, or null.
 *
 * Timestamp is `{ int64 seconds = 1; int32 nanos = 2; }`. A Date holds
 * milliseconds, so the nanoseconds are floored rather than carried -- which is
 * all the index column stores anyway.
 *
 * @param {Map<number, Array>} fields - A decoded message
 * @param {number} field - Field number
 * @returns {Date|null}
 */
export function readTimestamp(fields, field) {
  const timestamp = readMessage(fields, field);
  if (!timestamp) return null;

  const seconds = readInt(timestamp, 1);
  if (seconds === null) return null;

  const nanos = readInt(timestamp, 2, 0) ?? 0;
  const date = new Date(seconds * 1000 + Math.floor(nanos / 1e6));
  return Number.isNaN(date.getTime()) ? null : date;
}
