// -----------------------------------------------------------------------------
// Wire format of the Eco Aterno box (a Delta Dore Tydom gateway).
//
// The box speaks HTTP *inside* WebSocket frames: every frame is one complete
// HTTP/1.1 message, in both directions.
//   - we send requests       (GET /devices/data HTTP/1.1 ...);
//   - the box answers        (HTTP/1.1 200 OK ..., `Uri-Origin` = the request
//     path, `Transac-Id` = the id we sent);
//   - the box also PUSHES requests of its own when something changes
//     (PUT /devices/data HTTP/1.1 ...), which need no answer.
// Through the cloud relay every frame is prefixed with the byte 0x02; on the
// local network it is not.
// -----------------------------------------------------------------------------

export const REMOTE_PREFIX = 0x02;

const CRLF = '\r\n';
const HEADER_END = Buffer.from('\r\n\r\n');
const RESPONSE_LINE = /^HTTP\/\d\.\d (\d{3})/;
const REQUEST_LINE = /^([A-Z]+) (\S+) HTTP\/\d\.\d$/;

/**
 * Serialize a request for the box.
 * @param {object} request
 * @param {'GET' | 'PUT' | 'POST' | 'DELETE'} request.method
 * @param {string} request.url path, e.g. `/devices/data`
 * @param {unknown} [request.body] JSON-serializable body
 * @param {string} request.transactionId echoed by the box in its answer
 * @param {boolean} [request.remote] prefix the frame for the cloud relay
 * @returns {Buffer}
 */
export function buildRequest({ method, url, body, transactionId, remote = false }) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const head =
    `${method} ${url} HTTP/1.1${CRLF}` +
    `Content-Length: ${Buffer.byteLength(payload)}${CRLF}` +
    `Content-Type: application/json; charset=UTF-8${CRLF}` +
    `Transac-Id: ${transactionId}${CRLF}${CRLF}`;
  const text = payload ? `${head}${payload}${CRLF}${CRLF}` : head;
  const frame = Buffer.from(text, 'utf8');
  return remote ? Buffer.concat([Buffer.from([REMOTE_PREFIX]), frame]) : frame;
}

// Decode a `Transfer-Encoding: chunked` body. The box is lenient with the
// format, so is this: a truncated last chunk is kept, a missing terminator
// is fine.
function decodeChunked(body) {
  const parts = [];
  let offset = 0;
  while (offset < body.length) {
    const lineEnd = body.indexOf(CRLF, offset);
    if (lineEnd === -1) {
      break;
    }
    const sizeText = body.toString('ascii', offset, lineEnd).split(';')[0].trim();
    if (sizeText === '') {
      offset = lineEnd + 2;
      continue;
    }
    if (!/^[0-9a-f]+$/i.test(sizeText)) {
      // Not chunked after all: keep the body as it is.
      return body;
    }
    const size = parseInt(sizeText, 16);
    if (size === 0) {
      break;
    }
    const start = lineEnd + 2;
    parts.push(body.subarray(start, start + size));
    offset = start + size;
  }
  return Buffer.concat(parts);
}

/**
 * Parse one WebSocket frame received from the box.
 * @param {Buffer} frame
 * @returns {{
 *   type: 'response' | 'request',
 *   status: number | null,
 *   method: string | null,
 *   uri: string,
 *   transactionId: string | null,
 *   headers: Record<string, string>,
 *   body: unknown,
 * } | null} null when the frame is not an HTTP message (binary noise)
 */
export function parseMessage(frame) {
  let data = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
  if (data.length > 0 && data[0] === REMOTE_PREFIX) {
    data = data.subarray(1);
  }
  const headerEnd = data.indexOf(HEADER_END);
  const head = (headerEnd === -1 ? data : data.subarray(0, headerEnd)).toString('utf8');
  const [startLine, ...headerLines] = head.split(CRLF);

  const response = RESPONSE_LINE.exec(startLine);
  const request = response ? null : REQUEST_LINE.exec(startLine);
  if (!response && !request) {
    return null;
  }

  const headers = {};
  for (const line of headerLines) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }

  let rawBody = headerEnd === -1 ? Buffer.alloc(0) : data.subarray(headerEnd + HEADER_END.length);
  if (/chunked/i.test(headers['transfer-encoding'] ?? '')) {
    rawBody = decodeChunked(rawBody);
  } else if (headers['content-length'] !== undefined) {
    const length = Number(headers['content-length']);
    if (Number.isInteger(length) && length >= 0 && length <= rawBody.length) {
      rawBody = rawBody.subarray(0, length);
    }
  }

  const text = rawBody.toString('utf8').trim();
  let body = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      // An HTML error page, or a body the box cut short: keep the text, the
      // caller decides what a non-JSON answer means for its request.
      body = text;
    }
  }

  return {
    type: response ? 'response' : 'request',
    status: response ? Number(response[1]) : null,
    method: request ? request[1] : null,
    uri: request ? request[2] : (headers['uri-origin'] ?? ''),
    transactionId: headers['transac-id'] ?? null,
    headers,
    body,
  };
}
