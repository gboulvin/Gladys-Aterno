// -----------------------------------------------------------------------------
// HTTP Digest access authentication (RFC 2617, MD5, qop=auth).
//
// The Eco Aterno box authenticates the WebSocket upgrade with it: the user is
// the MAC address of the box, the password the one chosen in the Eco Aterno
// app. A first plain GET returns the challenge (401 + WWW-Authenticate), the
// answer travels in the Authorization header of the upgrade request.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

const md5 = (text) => createHash('md5').update(text).digest('hex');

/**
 * Parse a `WWW-Authenticate: Digest ...` header.
 * @param {string | undefined} header raw header value
 * @returns {{ realm: string, nonce: string, qop?: string, opaque?: string } | null}
 *   the challenge, or null when the header carries no usable Digest challenge
 */
export function parseDigestChallenge(header) {
  if (typeof header !== 'string' || !/^\s*Digest\s/i.test(header)) {
    return null;
  }
  const fields = {};
  const pattern = /([a-z]+)\s*=\s*(?:"([^"]*)"|([^\s,]+))/gi;
  for (const [, key, quoted, bare] of header.replace(/^\s*Digest\s+/i, '').matchAll(pattern)) {
    fields[key.toLowerCase()] = quoted ?? bare;
  }
  if (!fields.nonce) {
    return null;
  }
  return {
    realm: fields.realm ?? '',
    nonce: fields.nonce,
    // A server may offer several protections ("auth,auth-int"): only `auth`
    // is implemented, the upgrade request has no body to protect anyway.
    qop: fields.qop
      ?.split(',')
      .map((v) => v.trim())
      .includes('auth')
      ? 'auth'
      : undefined,
    opaque: fields.opaque,
  };
}

/**
 * Build the `Authorization` header answering a Digest challenge.
 * `cnonce` and `nc` are only parameters for the tests: leave them out.
 */
export function buildDigestHeader({
  username,
  password,
  method,
  uri,
  challenge,
  cnonce = randomBytes(8).toString('hex'),
  nc = '00000001',
}) {
  const { realm, nonce, qop, opaque } = challenge;
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (opaque) {
    parts.push(`opaque="${opaque}"`);
  }
  return `Digest ${parts.join(', ')}`;
}
