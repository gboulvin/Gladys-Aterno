import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigestHeader, parseDigestChallenge } from '../src/tydom/digest.js';

test('parses the challenge of the cloud relay', () => {
  const challenge = parseDigestChallenge('Digest realm="ServiceMedia", qop="auth", nonce="abc=="');
  assert.deepEqual(challenge, {
    realm: 'ServiceMedia',
    nonce: 'abc==',
    qop: 'auth',
    opaque: undefined,
  });
});

test('a missing or foreign challenge is no challenge', () => {
  assert.equal(parseDigestChallenge(undefined), null);
  assert.equal(parseDigestChallenge('Basic realm="x"'), null);
  assert.equal(parseDigestChallenge('Digest realm="x"'), null);
});

test('computes the response of the RFC 2617 example', () => {
  const header = buildDigestHeader({
    username: 'Mufasa',
    password: 'Circle Of Life',
    method: 'GET',
    uri: '/dir/index.html',
    challenge: {
      realm: 'testrealm@host.com',
      nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
      qop: 'auth',
      opaque: '5ccc069c403ebaf9f0171e9517f40e41',
    },
    cnonce: '0a4f113b',
    nc: '00000001',
  });
  assert.match(header, /^Digest username="Mufasa", realm="testrealm@host.com"/);
  assert.match(header, /response="6629fae49393a05397450978507c4ef1"/);
  assert.match(header, /qop=auth, nc=00000001, cnonce="0a4f113b"/);
  assert.match(header, /opaque="5ccc069c403ebaf9f0171e9517f40e41"/);
});

test('the password never appears in the header', () => {
  const header = buildDigestHeader({
    username: '001A25ABCDEF',
    password: 'my-box-password',
    method: 'GET',
    uri: '/mediation/client?mac=001A25ABCDEF&appli=1',
    challenge: { realm: 'protected area', nonce: 'n', qop: 'auth' },
  });
  assert.ok(!header.includes('my-box-password'));
});
