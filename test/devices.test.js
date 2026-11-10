// -----------------------------------------------------------------------------
// The integration end to end: the fake Gladys of the SDK on one side (it
// refuses what the real host API refuses), a simulated box on the other.
// -----------------------------------------------------------------------------

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBox } from './helpers/fakeBox.js';
import { CONFIG, settle, startApp } from './helpers/app.js';

const keepAlive = setInterval(() => {}, 1000);
after(() => clearInterval(keepAlive));

const PREFIX = 'ext:test-integration:radiator:001a25abcdef';
const SALON = `${PREFIX}-1001-1001`;
const BATHROOM = `${PREFIX}-1002-1002`;

const byKey = (device) =>
  Object.fromEntries(device.features.map((f) => [f.external_id.split(':').pop(), f]));

test('publishes one device per radiator, accepted by Gladys', async () => {
  const { gladys, stop } = await startApp();
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.external_id, device.name]),
    [
      [SALON, 'Radiateur salon'],
      [BATHROOM, 'Salle de bain - Sèche-serviettes'],
    ],
  );
  // The fake Gladys refuses an unknown category, type or unit with a 400.
  assert.ok(gladys.fake.requests.every((request) => request.status < 400));

  const salon = byKey(devices[0]);
  assert.deepEqual(Object.keys(salon), [
    'target-temperature',
    'temperature',
    'mode',
    'frost-protection',
    'window',
    'presence',
  ]);
  assert.equal(salon['target-temperature'].min, 10);
  assert.equal(salon['target-temperature'].max, 30);
  assert.equal(salon['target-temperature'].read_only, false);
  assert.equal(salon.temperature.read_only, true);
  assert.equal(salon.window.read_only, true);
  // Only the bathroom model has a boost.
  assert.ok(byKey(devices[1]).boost);
  assert.equal(salon.boost, undefined);
  stop();
});

test('names the features in the configured language', async () => {
  const names = async (language) => {
    const { gladys, stop } = await startApp({ config: { ...CONFIG, language } });
    stop();
    return gladys.fake.discoveredDevices[0].features.map((feature) => feature.name);
  };
  assert.equal((await names('fr'))[0], 'Température demandée');
  assert.equal((await names('en'))[0], 'Target temperature');
  assert.equal((await names('de'))[0], 'Solltemperatur');
  assert.equal((await names('es'))[0], 'Temperatura deseada');
});

test('publishes the states read on the box', async () => {
  const { gladys, stop } = await startApp();
  const state = (device, key) => gladys.fake.lastState(`${device}:${key}`);
  assert.equal(state(SALON, 'target-temperature'), 19.5);
  assert.equal(state(SALON, 'temperature'), 20.1);
  assert.equal(state(SALON, 'mode'), 1);
  assert.equal(state(SALON, 'frost-protection'), 0);
  assert.equal(state(SALON, 'window'), 1); // closed
  assert.equal(state(SALON, 'presence'), 1);
  assert.equal(state(BATHROOM, 'boost'), 0);
  stop();
});

test('follows the changes pushed by the box', async () => {
  const { gladys, box, stop } = await startApp();
  const [salon] = box.radiators;
  box.push(salon, { openingDetected: true, temperature: 18.7, hvacMode: 'STOP' });
  await settle();
  assert.equal(gladys.fake.lastState(`${SALON}:window`), 0); // open
  assert.equal(gladys.fake.lastState(`${SALON}:temperature`), 18.7);
  assert.equal(gladys.fake.lastState(`${SALON}:mode`), 0);

  box.push(salon, { hvacMode: 'ANTI_FROST', antifrostOn: true });
  await settle();
  // Frost protection is a way of heating, with its own switch.
  assert.equal(gladys.fake.lastState(`${SALON}:mode`), 1);
  assert.equal(gladys.fake.lastState(`${SALON}:frost-protection`), 1);
  stop();
});

test('an unchanged value is not published again', async () => {
  const { gladys, box, stop } = await startApp();
  const count = () => gladys.fake.states.length;
  const before = count();
  box.push(box.radiators[0], { temperature: 20.1 });
  box.push(box.radiators[0], { temperature: 19.9 });
  await settle();
  assert.equal(count(), before + 1);
  stop();
});

test('runs the commands of Gladys and publishes what the box confirms', async () => {
  const { gladys, box, stop } = await startApp();
  const [salonDevice, bathroomDevice] = gladys.fake.discoveredDevices;
  const set = (device, key, value) => gladys.fake.setValue(device, byKey(device)[key], value);

  assert.deepEqual(await set(salonDevice, 'target-temperature', 21.5), { success: true });
  assert.deepEqual(await set(salonDevice, 'mode', 0), { success: true });
  assert.deepEqual(await set(bathroomDevice, 'boost', 1), { success: true });
  assert.deepEqual(await set(bathroomDevice, 'frost-protection', 1), { success: true });
  await settle();

  assert.equal(box.radiators[0].values.setpoint, 21.5);
  assert.equal(box.radiators[0].values.hvacMode, 'STOP');
  assert.equal(box.radiators[1].values.boostOn, true);
  assert.equal(box.radiators[1].values.hvacMode, 'ANTI_FROST');
  assert.equal(gladys.fake.lastState(`${SALON}:target-temperature`), 21.5);
  assert.equal(gladys.fake.lastState(`${SALON}:mode`), 0);
  assert.equal(gladys.fake.lastState(`${BATHROOM}:boost`), 1);
  assert.equal(gladys.fake.lastState(`${BATHROOM}:frost-protection`), 1);

  // Back to heating from the frost-protection switch.
  assert.deepEqual(await set(bathroomDevice, 'frost-protection', 0), { success: true });
  assert.equal(box.radiators[1].values.hvacMode, 'NORMAL');
  stop();
});

test('a command that cannot be run is acked as failed', async () => {
  const { gladys, box, stop } = await startApp();
  const [salonDevice] = gladys.fake.discoveredDevices;
  const features = byKey(salonDevice);

  const readOnly = await gladys.fake.setValue(salonDevice, features.temperature, 25);
  assert.equal(readOnly.success, false);
  const unknown = await gladys.fake.setValue(
    { external_id: `${PREFIX}-9-9` },
    features['target-temperature'],
    20,
  );
  assert.equal(unknown.success, false);

  box.reachable = { local: false, cloud: false };
  box.disconnect();
  const offline = await gladys.fake.setValue(salonDevice, features['target-temperature'], 20);
  assert.equal(offline.success, false);
  assert.match(offline.error, /not connected/);
  stop();
});

test('reports the connection status and the transport badge', async () => {
  const { gladys, stop } = await startApp();
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  const last = gladys.fake.transports.slice(-2);
  assert.deepEqual(
    last.map(({ device_external_id: id, transport, degraded }) => [id, transport, degraded]),
    [
      [SALON, 'local', undefined],
      [BATHROOM, 'local', undefined],
    ],
  );
  stop();
});

test('a cloud fallback is flagged degraded, with the reason in four languages', async () => {
  const box = createFakeBox();
  box.reachable.local = false;
  const { gladys, stop } = await startApp({ box, preferredRetryDelay: 60_000 });
  const entry = gladys.fake.transports.at(-1);
  assert.equal(entry.transport, 'cloud');
  assert.equal(entry.degraded, true);
  assert.deepEqual(Object.keys(entry.message), ['en', 'fr', 'de', 'es']);
  assert.ok(Object.values(entry.message).every((text) => text.length <= 200));
  // Connected, with the explanation shown in the Configuration screen.
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /cloud/);
  stop();
});

test('says what is missing or wrong instead of a bare "disconnected"', async () => {
  const empty = await startApp({ config: {} });
  assert.equal(empty.gladys.fake.connectionStatus.connected, false);
  assert.match(empty.gladys.fake.connectionStatus.message.en, /MAC address and the password/);
  assert.equal(empty.box.clients.length, 0);
  empty.stop();

  const wrong = await startApp({ config: { ...CONFIG, password: 'wrong' }, retryDelays: [60_000] });
  assert.equal(wrong.gladys.fake.connectionStatus.connected, false);
  assert.match(wrong.gladys.fake.connectionStatus.message.en, /refused/);
  wrong.stop();
});

test('a lost box is reported unreachable, then recovers', async () => {
  const { gladys, box, stop } = await startApp({ retryDelays: [40] });
  box.disconnect();
  await settle(10);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  await settle(80);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.transports.at(-1).transport, 'local');
  stop();
});

test('a config change reconnects only when the connection is concerned', async () => {
  const { gladys, box, stop } = await startApp();
  assert.equal(box.clients.length, 1);

  await gladys.fake.configUpdated({ ...CONFIG, language: 'en', poll_frequency: 600 });
  assert.equal(box.clients.length, 1);
  assert.equal(gladys.fake.discoveredDevices[0].features[0].name, 'Target temperature');

  await gladys.fake.configUpdated({ ...CONFIG, GLADYS_PREFER_LOCAL: false });
  await settle();
  assert.equal(box.clients.length, 2);
  assert.equal(box.clients[0].connected, false);
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
  stop();
});

test('a scan re-reads the box: a newly paired radiator shows up', async () => {
  const { gladys, box, stop } = await startApp();
  box.radiators.push({
    deviceId: 1003,
    endpointId: 1003,
    name: 'Bureau',
    room: null,
    usage: 'electric',
    values: { setpoint: 18, temperature: 17.5, hvacMode: 'NORMAL' },
  });
  await gladys.fake.scanRequest();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Radiateur salon', 'Salle de bain - Sèche-serviettes', 'Bureau'],
  );
  stop();
});

test('the Configuration screen actions answer in four languages', async () => {
  const { gladys, box, stop } = await startApp();
  const test = await gladys.fake.action('test_connection');
  assert.equal(test.success, true);
  assert.equal(test.data.message.en, 'Connected (Local) to TYDOM1: 2 radiator(s) found.');
  assert.equal(test.data.message.fr, 'Connecté (Locale) à TYDOM1 : 2 radiateur(s) trouvé(s).');
  assert.deepEqual(Object.keys(test.data.message), ['en', 'fr', 'de', 'es']);

  const refresh = await gladys.fake.action('refresh_devices');
  assert.match(refresh.data.message.en, /^2 radiator\(s\) on the box/);

  // Box down: the test reconnects right away instead of waiting for a retry.
  box.reachable = { local: false, cloud: false };
  box.disconnect();
  const failed = await gladys.fake.action('test_connection');
  assert.match(failed.data.message.en, /cannot be reached/);
  box.reachable = { local: true, cloud: true };
  const recovered = await gladys.fake.action('test_connection');
  assert.match(recovered.data.message.en, /^Connected/);
  stop();
});

test('never sends the password to Gladys nor to the logs', async () => {
  const lines = [];
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args) => lines.push(args.map(String).join(' ')),
    ]),
  );
  const { gladys, stop } = await startApp({
    config: { ...CONFIG, password: 'S3cret-Box-Pw' },
    retryDelays: [60_000],
    logger,
  });
  stop();
  assert.ok(lines.length > 0);
  assert.ok(!lines.join('\n').includes('S3cret-Box-Pw'));
  assert.ok(!JSON.stringify(gladys.fake.requests).includes('S3cret-Box-Pw'));
});
