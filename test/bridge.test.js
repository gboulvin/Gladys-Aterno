import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AternoBridge, BridgeError, REASON, UNREACHABLE } from '../src/bridge.js';
import { normalizeConfig } from '../src/config.js';
import { MODE } from '../src/radiators.js';
import { MAC, PASSWORD, createFakeBox } from './helpers/fakeBox.js';

const config = (overrides = {}) =>
  normalizeConfig({ mac: MAC, password: PASSWORD, host: '192.168.1.50', ...overrides });

function bridgeFor(box, timing = {}) {
  const bridge = new AternoBridge({
    createClient: box.createClient,
    retryDelays: [10],
    preferredRetryDelay: 20,
    confirmDelay: 5,
    ...timing,
  });
  const statuses = [];
  bridge.on('status', (status) => statuses.push(status));
  return { bridge, statuses };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The timers of the bridge never hold the process open (they are unref'd):
// something else has to, while a test waits for a retry.
const keepAlive = setInterval(() => {}, 1000);
after(() => clearInterval(keepAlive));

test('without credentials, nothing is attempted', async () => {
  const box = createFakeBox();
  const { bridge } = bridgeFor(box);
  await bridge.start(normalizeConfig({}));
  assert.equal(box.clients.length, 0);
  assert.deepEqual(bridge.status, {
    transport: UNREACHABLE,
    degraded: false,
    reason: REASON.NOT_CONFIGURED,
  });
  bridge.stop();
});

test('connects locally when the address is known and local is preferred', async () => {
  const box = createFakeBox();
  const { bridge } = bridgeFor(box);
  await bridge.start(config());
  assert.deepEqual(bridge.status, { transport: 'local', degraded: false, reason: null });
  assert.equal(box.clients[0].options.host, '192.168.1.50');
  assert.equal(bridge.radiators.size, 2);
  assert.equal(bridge.info.productName, 'TYDOM1');
  bridge.stop();
  assert.equal(box.clients[0].connected, false);
});

test('goes through the cloud without a local address, or when the cloud is preferred', async () => {
  const box = createFakeBox();
  const cloudOnly = bridgeFor(box);
  await cloudOnly.bridge.start(config({ host: '' }));
  assert.deepEqual(cloudOnly.bridge.status, { transport: 'cloud', degraded: false, reason: null });
  assert.equal(box.clients[0].options.host, 'mediation.tydom.com');
  cloudOnly.bridge.stop();

  const preferCloud = bridgeFor(box);
  await preferCloud.bridge.start(config({ GLADYS_PREFER_LOCAL: false }));
  assert.equal(preferCloud.bridge.status.transport, 'cloud');
  assert.equal(preferCloud.bridge.status.degraded, false);
  preferCloud.bridge.stop();
});

test('falls back on the other channel, says so, and returns to the preferred one', async () => {
  const box = createFakeBox();
  box.reachable.local = false;
  const { bridge } = bridgeFor(box);
  await bridge.start(config());
  assert.deepEqual(bridge.status, {
    transport: 'cloud',
    degraded: true,
    reason: REASON.LOCAL_FAILED,
  });

  // The local network answers again: the bridge moves back on its own.
  box.reachable.local = true;
  await once(bridge, 'status');
  assert.deepEqual(bridge.status, { transport: 'local', degraded: false, reason: null });
  assert.equal(bridge.connected, true);
  bridge.stop();
});

test('cloud preferred but down: local fallback, flagged', async () => {
  const box = createFakeBox();
  box.reachable.cloud = false;
  const { bridge } = bridgeFor(box);
  await bridge.start(config({ GLADYS_PREFER_LOCAL: false }));
  assert.deepEqual(bridge.status, {
    transport: 'local',
    degraded: true,
    reason: REASON.CLOUD_FAILED,
  });
  bridge.stop();
});

test('a refused password stops the round: the other channel is not tried', async () => {
  const box = createFakeBox();
  const { bridge } = bridgeFor(box, { retryDelays: [10_000] });
  await bridge.start(config({ password: 'wrong' }));
  assert.equal(bridge.status.reason, REASON.AUTH);
  assert.equal(bridge.status.transport, UNREACHABLE);
  assert.equal(box.clients.length, 1);
  bridge.stop();
});

test('retries until the box answers, and reconnects after a drop', async () => {
  const box = createFakeBox();
  box.reachable = { local: false, cloud: false };
  const { bridge, statuses } = bridgeFor(box);
  await bridge.start(config());
  assert.equal(bridge.status.reason, REASON.UNREACHABLE);

  box.reachable = { local: true, cloud: true };
  await once(bridge, 'status');
  assert.equal(bridge.status.transport, 'local');

  box.disconnect();
  assert.equal(bridge.status.transport, UNREACHABLE);
  await once(bridge, 'status');
  assert.equal(bridge.status.transport, 'local');
  assert.deepEqual(
    statuses.map((status) => status.transport),
    [UNREACHABLE, 'local', UNREACHABLE, 'local'].slice(-statuses.length),
  );
  bridge.stop();
});

test('stop() ends the retries', async () => {
  const box = createFakeBox();
  box.reachable = { local: false, cloud: false };
  const { bridge } = bridgeFor(box);
  await bridge.start(config());
  const attempts = box.clients.length;
  bridge.stop();
  box.reachable = { local: true, cloud: true };
  await wait(40);
  assert.equal(box.clients.length, attempts);
  assert.equal(bridge.connected, false);
});

test('reports a change pushed by the box, once', async () => {
  const box = createFakeBox();
  const { bridge } = bridgeFor(box);
  await bridge.start(config());
  const changes = [];
  bridge.on('state', (change) => changes.push(change));

  const [salon] = box.radiators;
  box.push(salon, { setpoint: 22 });
  box.push(salon, { setpoint: 22 });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].radiator.key, '1001-1001');
  assert.equal(changes[0].previous.setpoint, 19.5);
  assert.equal(changes[0].state.setpoint, 22);
  assert.equal(changes[0].commanded, false);
  bridge.stop();
});

test('sends the commands and marks the changes they cause', async () => {
  const box = createFakeBox();
  const { bridge } = bridgeFor(box);
  await bridge.start(config());
  const changes = [];
  bridge.on('state', (change) => changes.push(change));

  await bridge.setTemperature('1001-1001', 21.3);
  await bridge.setMode('1001-1001', MODE.FROST);
  await bridge.setBoost('1002-1002', true);
  await wait(10);

  const writes = box.requests.filter((request) => request.method === 'PUT');
  assert.deepEqual(
    writes.map(({ url, body }) => [url, body]),
    [
      ['/devices/1001/endpoints/1001/data', [{ name: 'setpoint', value: 21.5 }]],
      ['/devices/1001/endpoints/1001/data', [{ name: 'hvacMode', value: 'ANTI_FROST' }]],
      ['/devices/1001/endpoints/1001/data', [{ name: 'antifrostOn', value: true }]],
      ['/devices/1002/endpoints/1002/data', [{ name: 'boostOn', value: true }]],
    ],
  );
  assert.ok(changes.length >= 3);
  assert.ok(changes.every((change) => change.commanded));
  bridge.stop();
});

test('a command that cannot be carried out says why', async () => {
  const box = createFakeBox();
  const { bridge } = bridgeFor(box);
  await bridge.start(config());

  await assert.rejects(bridge.setBoost('1001-1001', true), (err) => err.code === 'unsupported');
  await assert.rejects(bridge.setMode('nope', MODE.OFF), (err) => err.code === 'unknown_radiator');
  // On several radiators, the ones that cannot are skipped and counted out.
  const keys = [...bridge.radiators.keys()];
  assert.equal(await bridge.forEach(keys, (key) => bridge.setBoost(key, true)), 1);

  bridge.stop();
  await assert.rejects(
    bridge.setTemperature('1001-1001', 20),
    (err) => err instanceof BridgeError && err.code === 'unreachable',
  );
  await assert.rejects(
    bridge.forEach(keys, (key) => bridge.setBoost(key, true)),
    BridgeError,
  );
});

test('reads the values back after a command, in case a push was missed', async () => {
  const box = createFakeBox();
  box.echoWrites = false;
  const { bridge } = bridgeFor(box);
  await bridge.start(config());
  const changed = once(bridge, 'state');
  await bridge.setTemperature('1001-1001', 23);
  const [change] = await changed;
  assert.equal(change.state.setpoint, 23);
  bridge.stop();
});

test('a restart during an attempt leaves a single connection', async () => {
  const box = createFakeBox();
  const { bridge } = bridgeFor(box);
  const first = bridge.start(config());
  await bridge.start(config({ host: '192.168.1.60' }));
  await first;
  assert.equal(box.clients.filter((client) => client.connected).length, 1);
  assert.equal(bridge.client.options.host, '192.168.1.60');
  bridge.stop();
});
