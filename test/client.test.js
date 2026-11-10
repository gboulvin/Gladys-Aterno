// -----------------------------------------------------------------------------
// The real client against a real WebSocket server on the loopback interface,
// speaking the box protocol: Digest challenge, HTTP-over-WebSocket, pushes.
// Plain HTTP/WS (`secure: false`): the TLS options are the only part of the
// client these tests do not exercise.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { REMOTE_PREFIX, parseMessage } from '../src/tydom/protocol.js';
import { TRANSPORT, TydomAuthError, TydomClient } from '../src/tydom/client.js';

const MAC = '001A25ABCDEF';
const PASSWORD = 'secret';
const REALM = 'protected area';
const NONCE = 'bm9uY2U=';

const md5 = (text) => createHash('md5').update(text).digest('hex');

// Check a Digest Authorization header the way the box does.
function authorized(request) {
  const header = request.headers.authorization ?? '';
  const field = (name) => new RegExp(`${name}="?([^",]+)"?`).exec(header)?.[1];
  const ha1 = md5(`${MAC}:${REALM}:${PASSWORD}`);
  const ha2 = md5(`GET:${field('uri')}`);
  const expected = md5(`${ha1}:${NONCE}:${field('nc')}:${field('cnonce')}:auth:${ha2}`);
  return (
    field('username') === MAC && field('uri') === request.url && field('response') === expected
  );
}

async function startBox({ remote = false } = {}) {
  const frames = [];
  const server = http.createServer((request, response) => {
    response.writeHead(401, {
      'WWW-Authenticate': `Digest realm="${REALM}", qop="auth", nonce="${NONCE}"`,
    });
    response.end();
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    if (!authorized(request)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.on('message', (data) => {
        frames.push(data);
        const message = parseMessage(data);
        if (message.uri === '/silent') {
          return;
        }
        const body = JSON.stringify(message.uri === '/echo' ? message.body : { ok: true });
        const answer =
          `HTTP/1.1 ${message.uri === '/missing' ? '404 Not Found' : '200 OK'}\r\n` +
          `Uri-Origin: ${message.uri}\r\nContent-Type: application/json\r\n` +
          `Transfer-Encoding: chunked\r\nTransac-Id: ${message.transactionId}\r\n\r\n` +
          `${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`;
        ws.send(
          remote ? Buffer.concat([Buffer.from([REMOTE_PREFIX]), Buffer.from(answer)]) : answer,
        );
      });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    frames,
    wss,
    push(text) {
      for (const ws of wss.clients) {
        ws.send(text);
      }
    },
    async stop() {
      for (const ws of wss.clients) {
        ws.terminate();
      }
      server.close();
    },
  };
}

const clientFor = (box, options = {}) =>
  new TydomClient({
    host: '127.0.0.1',
    port: box.port,
    mac: MAC,
    password: PASSWORD,
    transport: TRANSPORT.LOCAL,
    secure: false,
    keepAliveInterval: 0,
    requestTimeout: 200,
    ...options,
  });

test('authenticates with Digest and exchanges requests', async () => {
  const box = await startBox();
  const client = clientFor(box);
  try {
    await client.connect();
    assert.equal(client.connected, true);
    assert.deepEqual(await client.get('/info'), { ok: true });
    const body = [{ name: 'setpoint', value: 20.5 }];
    assert.deepEqual(await client.put('/echo', body), body);
    // Local frames carry no prefix.
    assert.equal(box.frames[0][0], 'G'.charCodeAt(0));
  } finally {
    client.close();
    await box.stop();
  }
});

test('prefixes its frames through the cloud relay', async () => {
  const box = await startBox({ remote: true });
  const client = clientFor(box, { transport: TRANSPORT.CLOUD });
  try {
    await client.connect();
    assert.deepEqual(await client.get('/info'), { ok: true });
    assert.equal(box.frames[0][0], REMOTE_PREFIX);
  } finally {
    client.close();
    await box.stop();
  }
});

test('a wrong password is an authentication error, not a retryable one', async () => {
  const box = await startBox();
  const client = clientFor(box, { password: 'wrong' });
  try {
    await assert.rejects(client.connect(), TydomAuthError);
    assert.equal(client.connected, false);
  } finally {
    client.close();
    await box.stop();
  }
});

test('an unreachable box rejects the connection', async () => {
  const box = await startBox();
  await box.stop();
  await assert.rejects(clientFor(box).connect(), (err) => !(err instanceof TydomAuthError));
});

test('relays the pushes of the box', async () => {
  const box = await startBox();
  const client = clientFor(box);
  try {
    await client.connect();
    const pushed = once(client, 'push');
    const body = JSON.stringify([{ id: 1, endpoints: [] }]);
    box.push(
      'PUT /devices/data HTTP/1.1\r\ncontent-type: application/json\r\n' +
        `Transfer-Encoding: chunked\r\n\r\n${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`,
    );
    const [message] = await pushed;
    assert.equal(message.uri, '/devices/data');
    assert.deepEqual(message.body, JSON.parse(body));
  } finally {
    client.close();
    await box.stop();
  }
});

test('an error status, a silent box and a closed connection reject the request', async () => {
  const box = await startBox();
  const client = clientFor(box);
  try {
    await client.connect();
    await assert.rejects(client.get('/missing'), /HTTP 404/);
    await assert.rejects(client.get('/silent'), /no answer/);

    const closed = once(client, 'close');
    const pending = client.get('/silent');
    await box.stop();
    await assert.rejects(pending, /connection closed/);
    await closed;
    assert.equal(client.connected, false);
    await assert.rejects(client.get('/info'), /Not connected/);
  } finally {
    client.close();
  }
});
