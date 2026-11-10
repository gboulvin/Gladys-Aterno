import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REMOTE_PREFIX, buildRequest, parseMessage } from '../src/tydom/protocol.js';

const chunked = (text) => `${Buffer.byteLength(text).toString(16)}\r\n${text}\r\n0\r\n\r\n`;

test('a request without body is a bare HTTP request', () => {
  const frame = buildRequest({ method: 'GET', url: '/devices/data', transactionId: '42' });
  assert.equal(
    frame.toString(),
    'GET /devices/data HTTP/1.1\r\nContent-Length: 0\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\nTransac-Id: 42\r\n\r\n',
  );
});

test('a request with a body carries its JSON and byte length', () => {
  const body = [{ name: 'setpoint', value: 20.5 }];
  const frame = buildRequest({
    method: 'PUT',
    url: '/devices/1/endpoints/1/data',
    body,
    transactionId: '7',
  });
  const text = frame.toString();
  assert.match(text, /^PUT \/devices\/1\/endpoints\/1\/data HTTP\/1\.1\r\n/);
  assert.match(text, new RegExp(`Content-Length: ${JSON.stringify(body).length}\r\n`));
  assert.ok(text.endsWith(`\r\n\r\n${JSON.stringify(body)}\r\n\r\n`));
});

test('frames for the cloud relay are prefixed, and the prefix is ignored on the way back', () => {
  const frame = buildRequest({ method: 'GET', url: '/ping', transactionId: '1', remote: true });
  assert.equal(frame[0], REMOTE_PREFIX);
  assert.equal(frame.subarray(1).toString().split(' ')[0], 'GET');

  const answer = Buffer.concat([
    Buffer.from([REMOTE_PREFIX]),
    Buffer.from('HTTP/1.1 200 OK\r\nUri-Origin: /ping\r\nTransac-Id: 1\r\n\r\n'),
  ]);
  assert.equal(parseMessage(answer).status, 200);
});

test('parses a chunked answer of the box', () => {
  const body = JSON.stringify([{ id: 1, endpoints: [{ id: 1, error: 0, data: [] }] }]);
  const message = parseMessage(
    Buffer.from(
      'HTTP/1.1 200 OK\r\nServer: Tydom-001A25ABCDEF\r\nUri-Origin: /devices/data\r\n' +
        'Content-Type: application/json\r\nTransfer-Encoding: chunked\r\nTransac-Id: 99\r\n\r\n' +
        chunked(body),
    ),
  );
  assert.equal(message.type, 'response');
  assert.equal(message.status, 200);
  assert.equal(message.uri, '/devices/data');
  assert.equal(message.transactionId, '99');
  assert.deepEqual(message.body, JSON.parse(body));
});

test('reassembles a body sent in several chunks, accents included', () => {
  const body = JSON.stringify({ name: 'Sèche-serviettes', room: 'Salle de bain' });
  const bytes = Buffer.from(body);
  const first = bytes.subarray(0, 10);
  const second = bytes.subarray(10);
  const frame = Buffer.concat([
    Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n'),
    Buffer.from(`${first.length.toString(16)}\r\n`),
    first,
    Buffer.from(`\r\n${second.length.toString(16)}\r\n`),
    second,
    Buffer.from('\r\n0\r\n\r\n'),
  ]);
  assert.deepEqual(parseMessage(frame).body, JSON.parse(body));
});

test('parses a push of the box as a request', () => {
  const body = JSON.stringify([{ id: 1, endpoints: [{ id: 1, error: 0, data: [] }] }]);
  const message = parseMessage(
    Buffer.from(
      'PUT /devices/data HTTP/1.1\r\nServer: Tydom-001A25ABCDEF\r\n' +
        'content-type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n' +
        chunked(body),
    ),
  );
  assert.equal(message.type, 'request');
  assert.equal(message.method, 'PUT');
  assert.equal(message.uri, '/devices/data');
  assert.deepEqual(message.body, JSON.parse(body));
});

test('an empty answer has a null body, a non-JSON one keeps its text', () => {
  assert.equal(
    parseMessage(Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')).body,
    null,
  );
  const html = parseMessage(
    Buffer.from('HTTP/1.1 400 Bad Request\r\nContent-Length: 15\r\n\r\n<!doctype html>'),
  );
  assert.equal(html.status, 400);
  assert.equal(html.body, '<!doctype html>');
});

test('anything that is not an HTTP message is ignored', () => {
  assert.equal(parseMessage(Buffer.from([0x00, 0x01, 0x02])), null);
  assert.equal(parseMessage(Buffer.from('hello')), null);
});
