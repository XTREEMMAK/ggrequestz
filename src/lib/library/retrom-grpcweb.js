/**
 * Unary gRPC-Web over HTTP/1.1, on the `fetch` this project already has.
 *
 * ## Why gRPC-Web and not gRPC
 *
 * Retrom serves REST, gRPC and WebDAV on one port and picks between them per
 * request, on the content type (`packages/service/src/lib.rs`):
 *
 *     let is_grpc = req.headers().get(CONTENT_TYPE)
 *         .filter(|ct| ct.starts_with(b"application/grpc")).is_some();
 *
 * and the gRPC router is wrapped in tonic's `GrpcWebLayer`. So
 * `application/grpc-web+proto` reaches the same handlers as native gRPC, is
 * what Retrom's own web client uses, and -- unlike native gRPC -- needs no
 * HTTP/2, no ALPN and no second networking stack. `fetch` is enough.
 *
 * ## The framing
 *
 * A unary call is a POST to `/<package>.<Service>/<Method>` whose body is one
 * length-prefixed frame:
 *
 *     [1 byte flags][4 bytes big-endian length][message]
 *
 * The response is the same, followed by a frame whose flag has bit 0x80 set
 * carrying the trailers as HTTP-header text. Measured against the running
 * Retrom 0.8.4:
 *
 *     POST /retrom.ServerService/GetServerInfo
 *     -> 200 application/grpc-web+proto
 *        00 00000008 0a060a0410081804     (the response message)
 *        80 0000000f "grpc-status:0\r\n"  (the trailers)
 *
 * Bit 0x01 of the same flag byte means the frame body is compressed. This
 * client advertises no `grpc-accept-encoding`, so a conforming server must not
 * set it, and 0.8.4 measurably does not -- it answered with a flag byte of 0
 * and no `grpc-encoding` even when the request asked for gzip. It is still
 * checked, because the alternative is handing a compressed body to a protobuf
 * decoder and reporting whatever comes out.
 *
 * ## HTTP 200 is not success
 *
 * gRPC carries its status in the trailers, so a call that failed on the server
 * still answers `200 OK` with a body. Reading only the status line would report
 * a refusal as a successful call returning an empty message -- which for
 * `GetGames` is indistinguishable from an empty platform, and would let a sync
 * "complete" against a listing that was never returned. Since a completed sync
 * is what unlocks the index sweep, that failure does not stay quiet: it deletes
 * the library. `unary()` therefore refuses to return until it has seen
 * `grpc-status: 0`, and treats a *missing* status as an error too.
 */

/** What tonic sends and accepts. The `+proto` suffix is what its own client uses. */
export const GRPC_WEB_CONTENT_TYPE = "application/grpc-web+proto";

/** Set on the trailer frame's flag byte. */
const TRAILER_FLAG = 0x80;

/** Set on any frame whose body is compressed. Nothing here can decompress. */
const COMPRESSED_FLAG = 0x01;

const FRAME_HEADER = 5;

/**
 * The canonical gRPC status names, so a failure says "UNIMPLEMENTED" rather
 * than "12" -- they call for very different actions from an operator.
 */
export const GRPC_STATUS_NAMES = Object.freeze({
  0: "OK",
  1: "CANCELLED",
  2: "UNKNOWN",
  3: "INVALID_ARGUMENT",
  4: "DEADLINE_EXCEEDED",
  5: "NOT_FOUND",
  6: "ALREADY_EXISTS",
  7: "PERMISSION_DENIED",
  8: "RESOURCE_EXHAUSTED",
  9: "FAILED_PRECONDITION",
  10: "ABORTED",
  11: "OUT_OF_RANGE",
  12: "UNIMPLEMENTED",
  13: "INTERNAL",
  14: "UNAVAILABLE",
  15: "DATA_LOSS",
  16: "UNAUTHENTICATED",
});

/** A gRPC call that did not answer `grpc-status: 0`. */
export class GrpcError extends Error {
  constructor(method, status, detail = "") {
    const name = GRPC_STATUS_NAMES[status] ?? String(status);
    super(
      `${method} failed with gRPC status ${name}${detail ? `: ${detail}` : ""}`,
    );
    this.name = "GrpcError";
    this.method = method;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Wrap one serialized message as a gRPC-Web data frame.
 *
 * @param {Uint8Array} message - The serialized request
 * @returns {Uint8Array}
 */
export function frameRequest(message) {
  const out = new Uint8Array(FRAME_HEADER + message.length);
  out[0] = 0;
  new DataView(out.buffer).setUint32(1, message.length, false);
  out.set(message, FRAME_HEADER);
  return out;
}

/**
 * Trailer-frame payload, which is HTTP-header text.
 *
 * Names are lowercased: gRPC-Web trailer names are case-insensitive and tonic
 * does not promise a spelling.
 *
 * @param {Uint8Array} raw - The trailer frame's bytes
 * @returns {Object<string, string>}
 */
export function parseTrailers(raw) {
  const trailers = {};
  for (const line of new TextDecoder("utf-8").decode(raw).split("\r\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    trailers[line.slice(0, colon).trim().toLowerCase()] = line
      .slice(colon + 1)
      .trim();
  }
  return trailers;
}

/**
 * Split a gRPC-Web response body into its message and its trailers.
 *
 * A truncated frame stops the walk rather than throwing: a short read surfaces
 * as a missing `grpc-status`, which is an accurate description of what went
 * wrong and the same outcome as any other incomplete response.
 *
 * Only the first data frame is kept. Unary calls have exactly one; a server
 * streaming more would be a schema change, and taking the first is the same
 * thing tonic's own unary client does.
 *
 * `compressed` reports whether that data frame's flag byte claimed a compressed
 * body. It is reported rather than acted on here so that a non-zero
 * `grpc-status` still wins: an error trailer explains the response, and a
 * compression complaint about a body that was never meant to be read would
 * bury it.
 *
 * @param {Uint8Array} body - The whole response body
 * @returns {{message: Uint8Array, trailers: Object<string, string>,
 *   compressed: boolean}}
 */
export function parseResponseBody(body) {
  let message = null;
  let compressed = false;
  let trailers = {};
  let offset = 0;

  while (offset + FRAME_HEADER <= body.length) {
    const flags = body[offset];
    const length = new DataView(
      body.buffer,
      body.byteOffset + offset + 1,
      4,
    ).getUint32(0, false);

    const start = offset + FRAME_HEADER;
    const end = start + length;
    if (end > body.length) break;

    if (flags & TRAILER_FLAG) {
      trailers = { ...trailers, ...parseTrailers(body.subarray(start, end)) };
    } else if (message === null) {
      message = body.subarray(start, end);
      compressed = (flags & COMPRESSED_FLAG) !== 0;
    }
    offset = end;
  }

  return { message: message ?? new Uint8Array(0), trailers, compressed };
}

/**
 * One Retrom server, addressed by fully-qualified method name.
 *
 * @param {Object} options
 * @param {string} options.baseUrl - Origin of the Retrom service port
 * @param {Function} [options.fetch] - Transport, for tests
 * @param {number} [options.timeoutMs] - Per-call deadline
 * @returns {{unary: Function, baseUrl: string}}
 */
export function createGrpcWebChannel({
  baseUrl,
  fetch: transport = globalThis.fetch,
  timeoutMs = 30000,
}) {
  const origin = String(baseUrl ?? "").replace(/\/+$/, "");

  return {
    baseUrl: origin,

    /**
     * Call `method` (e.g. `retrom.GameService/GetGames`) once.
     *
     * An empty response message is legitimate and never treated as a failure:
     * a message whose fields are all at proto3 defaults encodes to zero bytes,
     * so `GetGames` on an empty platform genuinely answers with nothing.
     * Measured on 0.8.4: `GetGames{platform_ids:[<no such platform>]}` returns
     * `200`, `grpc-status: 0` and a zero-length message.
     *
     * @param {string} method - `<package>.<Service>/<Method>`
     * @param {Uint8Array} request - The serialized request message
     * @returns {Promise<Uint8Array>} - The serialized response message
     * @throws {GrpcError}
     */
    async unary(method, request) {
      if (!origin) {
        throw new GrpcError(
          method,
          14,
          "Retrom is not configured: set LIBRARY_URL to the service address " +
            "(Retrom's default service port is 5101)",
        );
      }

      const path = `${origin}/${method.replace(/^\/+/, "")}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await transport(path, {
          method: "POST",
          headers: {
            "content-type": GRPC_WEB_CONTENT_TYPE,
            accept: GRPC_WEB_CONTENT_TYPE,
            // tonic-web reads this to tell a gRPC-Web client from a browser
            // doing something else with the same content type.
            "x-grpc-web": "1",
          },
          body: frameRequest(request),
          signal: controller.signal,
        });
      } catch (error) {
        const detail =
          error?.name === "AbortError"
            ? `no response within ${timeoutMs}ms`
            : `transport error: ${error?.message ?? error}`;
        throw new GrpcError(method, 14, detail);
      } finally {
        clearTimeout(timer);
      }

      if (response.status !== 200) {
        // Not a gRPC status at all: the request never reached a handler. Note
        // that a method this server does not have is *not* one of these --
        // measured on 0.8.4, an unknown method and an unknown service both
        // answer 200 with `grpc-status: 12` (UNIMPLEMENTED), which is handled
        // below. A non-200 means something in front of the handlers: a proxy,
        // a wrong port, or a Retrom that is not serving gRPC at all.
        const hint =
          response.status === 404
            ? " -- nothing is routing this path; check that LIBRARY_URL points " +
              "at Retrom's service port rather than at a proxy or its web UI"
            : "";
        throw new GrpcError(
          method,
          2,
          `HTTP ${response.status} from ${path}${hint}`,
        );
      }

      const body = new Uint8Array(await response.arrayBuffer());
      const { message, trailers, compressed } = parseResponseBody(body);

      // A "trailers-only" response carries the status in the HTTP headers and
      // has no trailer frame at all. tonic emits one for some early rejections,
      // and missing it would turn a refusal into a silent empty result.
      if (trailers["grpc-status"] === undefined) {
        for (const name of ["grpc-status", "grpc-message"]) {
          const value = response.headers?.get?.(name);
          if (value !== null && value !== undefined) trailers[name] = value;
        }
      }

      const rawStatus = trailers["grpc-status"];
      if (rawStatus === undefined) {
        throw new GrpcError(
          method,
          2,
          "the response carried no grpc-status, so the call cannot be reported " +
            "as having succeeded (truncated response, or not a gRPC-Web endpoint)",
        );
      }

      const status = Number.parseInt(rawStatus, 10);
      if (!Number.isInteger(status)) {
        throw new GrpcError(
          method,
          2,
          `unparseable grpc-status ${JSON.stringify(rawStatus)}`,
        );
      }
      if (status !== 0) {
        throw new GrpcError(method, status, trailers["grpc-message"] ?? "");
      }

      // A compressed body is refused rather than decoded. Nothing here can
      // inflate it, and handing the compressed bytes to the protobuf decoder
      // would produce either a confusing parse error or -- worse -- a message
      // that decodes to nothing and reads as an empty library.
      if (compressed) {
        throw new GrpcError(
          method,
          13,
          "the response frame is marked compressed and this client sent no " +
            "grpc-accept-encoding, so it cannot be read; disable response " +
            "compression between here and Retrom",
        );
      }

      return message;
    },
  };
}
