// -----------------------------------------------------------------------------
// Finding the box on the local network (mDNS through Gladys), and keeping its
// address up to date when it changes.
// -----------------------------------------------------------------------------

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createDiscovery, pickBoxAddresses } from '../src/discovery.js';
import { createFakeBox } from './helpers/fakeBox.js';
import { CONFIG, mdnsAnswers, settle, silentLogger, startApp } from './helpers/app.js';

const keepAlive = setInterval(() => {}, 1000);
after(() => clearInterval(keepAlive));

const MAC = '001A25ABCDEF';
const NO_HOST = { ...CONFIG, host: '' };

test('picks the Tydom boxes among the mDNS answers, its own first', () => {
  const services = [
    { name: 'Printer', host: 'printer.local', addresses: ['192.168.1.9'] },
    { name: 'TYDOM-123456', host: 'tydom-123456.local', addresses: ['192.168.1.30'] },
    { name: 'Box', host: 'TYDOM-ABCDEF.local', addresses: ['fe80::1', '192.168.1.50'] },
    { name: 'TYDOM-ABCDEF', host: 'tydom-abcdef.local', addresses: ['192.168.1.50'] },
    { name: 'tydom-broken', addresses: ['not an address', '300.1.1.1'] },
    null,
  ];
  assert.deepEqual(pickBoxAddresses(services, MAC), ['192.168.1.50', '192.168.1.30']);
  assert.deepEqual(pickBoxAddresses(undefined, MAC), []);
});

test('scans through Gladys, and not on every reconnection attempt', async () => {
  const gladys = createFakeGladys({ scanResults: { mdns: mdnsAnswers() } });
  const discover = createDiscovery(gladys, { logger: silentLogger, minIntervalMs: 60_000 });
  assert.deepEqual(await discover({ mac: MAC }), ['192.168.1.50']);
  assert.deepEqual(await discover({ mac: MAC }), ['192.168.1.50']);
  const scans = gladys.fake.requests.filter((r) => r.path === '/network_discovery/scan');
  assert.equal(scans.length, 1);
  assert.equal(scans[0].body.type, 'mdns');
});

test('a scan that fails finds nothing, it does not throw', async () => {
  const gladys = createFakeGladys();
  gladys.scanNetwork = async () => {
    throw new Error('403 network_discovery not declared');
  };
  const discover = createDiscovery(gladys, { logger: silentLogger, minIntervalMs: 0 });
  assert.deepEqual(await discover({ mac: MAC }), []);
});

test('without an address entered, finds the box and connects locally', async () => {
  const { gladys, bridge, stop } = await startApp({ config: NO_HOST, mdns: mdnsAnswers() });
  assert.deepEqual(bridge.status, { transport: 'local', degraded: false, reason: null });
  assert.equal(bridge.localHost, '192.168.1.50');
  assert.equal(gladys.fake.transports.at(-1).transport, 'local');

  const test = await gladys.fake.action('test_connection');
  assert.match(test.data.message.en, /found on your network at 192\.168\.1\.50/);
  assert.match(test.data.message.fr, /Réservez cette adresse/);
  assert.deepEqual(Object.keys(test.data.message), ['en', 'fr', 'de', 'es']);
  stop();
});

test('nothing found on the network: the cloud, as a normal channel', async () => {
  const { bridge, box, stop } = await startApp({ config: NO_HOST });
  assert.deepEqual(bridge.status, { transport: 'cloud', degraded: false, reason: null });
  assert.equal(box.clients.length, 1);
  stop();
});

test('an address that answers is never replaced by a scan', async () => {
  const { gladys, bridge, stop } = await startApp({ mdns: mdnsAnswers('192.168.1.77') });
  assert.equal(bridge.localHost, '192.168.1.50');
  assert.ok(!gladys.fake.requests.some((r) => r.path === '/network_discovery/scan'));
  stop();
});

test('the box changed address: found again, still local', async () => {
  const box = createFakeBox();
  const mdns = mdnsAnswers('192.168.1.50');
  const { gladys, bridge, stop } = await startApp({
    config: NO_HOST,
    box,
    mdns,
    retryDelays: [20],
  });
  assert.equal(bridge.localHost, '192.168.1.50');

  // The router gave the box another address, and the box now announces it.
  box.localAddress = '192.168.1.61';
  gladys.fake.scanResults.mdns = mdnsAnswers('192.168.1.61');
  box.disconnect();
  await settle(60);

  assert.deepEqual(bridge.status, { transport: 'local', degraded: false, reason: null });
  assert.equal(bridge.localHost, '192.168.1.61');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  stop();
});

test('an address entered by hand that went stale is worked around', async () => {
  const box = createFakeBox();
  box.localAddress = '192.168.1.61';
  const lines = [];
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [level, (msg) => lines.push(String(msg))]),
  );
  const { bridge, stop } = await startApp({ box, mdns: mdnsAnswers('192.168.1.61'), logger });
  assert.deepEqual(bridge.status, { transport: 'local', degraded: false, reason: null });
  assert.equal(bridge.localHost, '192.168.1.61');
  assert.ok(lines.some((line) => /no longer answers at 192\.168\.1\.50/.test(line)));
  stop();
});

test('a box that is gone from the network: cloud, flagged degraded', async () => {
  const box = createFakeBox();
  const { bridge, stop } = await startApp({
    config: NO_HOST,
    box,
    mdns: mdnsAnswers(),
    preferredRetryDelay: 60_000,
  });
  assert.equal(bridge.status.transport, 'local');

  box.reachable.local = false;
  box.disconnect();
  await settle(40);
  assert.deepEqual(bridge.status, {
    transport: 'cloud',
    degraded: true,
    reason: 'local_failed',
  });
  stop();
});

test('back to local by itself once the box is found again', async () => {
  const box = createFakeBox();
  box.reachable.local = false;
  const { bridge, stop } = await startApp({ config: NO_HOST, box, mdns: mdnsAnswers() });
  assert.equal(bridge.status.transport, 'cloud');
  assert.equal(bridge.status.degraded, true);

  box.reachable.local = true;
  await settle(80);
  assert.deepEqual(bridge.status, { transport: 'local', degraded: false, reason: null });
  assert.equal(bridge.localHost, '192.168.1.50');
  stop();
});

test('cloud preferred: the network is not even searched while the cloud answers', async () => {
  const { gladys, bridge, stop } = await startApp({
    config: { ...NO_HOST, GLADYS_PREFER_LOCAL: false },
    mdns: mdnsAnswers(),
  });
  assert.equal(bridge.status.transport, 'cloud');
  assert.ok(!gladys.fake.requests.some((r) => r.path === '/network_discovery/scan'));
  stop();
});

test('cloud preferred but down: the box found on the network takes over', async () => {
  const box = createFakeBox();
  box.reachable.cloud = false;
  const { bridge, stop } = await startApp({
    config: { ...NO_HOST, GLADYS_PREFER_LOCAL: false },
    box,
    mdns: mdnsAnswers(),
    preferredRetryDelay: 60_000,
  });
  assert.deepEqual(bridge.status, { transport: 'local', degraded: true, reason: 'cloud_failed' });
  stop();
});

test('a box not found at startup is looked for again later', async () => {
  const { gladys, bridge, stop } = await startApp({ config: NO_HOST });
  assert.deepEqual(bridge.status, { transport: 'cloud', degraded: false, reason: null });

  // The box shows up on the network (it was off, or the scan missed it).
  gladys.fake.scanResults.mdns = mdnsAnswers();
  await settle(80);
  assert.deepEqual(bridge.status, { transport: 'local', degraded: false, reason: null });
  assert.equal(bridge.localHost, '192.168.1.50');
  stop();
});
