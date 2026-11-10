import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBox } from './helpers/fakeBox.js';
import { settle, startApp } from './helpers/app.js';

const keepAlive = setInterval(() => {}, 1000);
after(() => clearInterval(keepAlive));

const PREFIX = 'ext:test-integration:radiator:001a25abcdef';
const SALON = `${PREFIX}-1001-1001`;
const BATHROOM = `${PREFIX}-1002-1002`;

const events = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

// --- Triggers ----------------------------------------------------------------

test('starting up fires nothing: reading a state is not a change', async () => {
  const { gladys, stop } = await startApp();
  assert.deepEqual(gladys.fake.sceneEvents, []);
  stop();
});

test('a mode changed from the app or the thermostat fires one event', async () => {
  const { gladys, box, stop } = await startApp();
  box.push(box.radiators[0], { hvacMode: 'STOP' });
  // The same mode again, and a value that is not the mode: no new event.
  box.push(box.radiators[0], { hvacMode: 'STOP' });
  box.push(box.radiators[0], { temperature: 19 });
  await settle();
  assert.deepEqual(events(gladys, 'radiator_mode_changed'), [
    {
      key: 'radiator_mode_changed',
      data: {
        device: SALON,
        device_name: 'Radiateur salon',
        mode: 'off',
        previous_mode: 'heating',
      },
    },
  ]);
  stop();
});

test('a mode changed by the integration itself fires nothing (no scene loop)', async () => {
  const { gladys, stop } = await startApp();
  const ack = await gladys.fake.sceneAction('set_mode', { device: SALON, mode: 'frost' });
  assert.equal(ack.success, true);
  await settle();
  assert.deepEqual(events(gladys, 'radiator_mode_changed'), []);
  stop();
});

test('a fault fires once when it appears, with a readable description', async () => {
  const { gladys, box, stop } = await startApp({ config: undefined });
  const [salon] = box.radiators;
  box.push(salon, { tempSensorDefect: true });
  box.push(salon, { tempSensorDefect: true, temperature: 0 });
  await settle();
  assert.deepEqual(events(gladys, 'radiator_fault'), [
    {
      key: 'radiator_fault',
      data: {
        device: SALON,
        device_name: 'Radiateur salon',
        fault: 'temperature_sensor',
        fault_label: 'Défaut de la sonde de température',
      },
    },
  ]);
  // Cleared, then back: a new event.
  box.push(salon, { tempSensorDefect: false });
  box.push(salon, { tempSensorDefect: true });
  await settle();
  assert.equal(events(gladys, 'radiator_fault').length, 2);
  stop();
});

test('the connection trigger follows the channel in use', async () => {
  const box = createFakeBox();
  const { gladys, stop } = await startApp({ box, retryDelays: [30] });
  // Connecting at startup is not an event.
  assert.deepEqual(events(gladys, 'connection_changed'), []);

  box.disconnect();
  await settle(80);
  assert.deepEqual(
    events(gladys, 'connection_changed').map((event) => event.data),
    [
      { status: 'unreachable', previous_status: 'local' },
      { status: 'local', previous_status: 'unreachable' },
    ],
  );
  stop();
});

// --- Actions -----------------------------------------------------------------

test('set_temperature targets one radiator, or all of them when none is chosen', async () => {
  const { gladys, box, stop } = await startApp();
  const one = await gladys.fake.sceneAction('set_temperature', { device: SALON, temperature: 18 });
  assert.deepEqual(one, { success: true, data: { outputs: { updated: 1 } } });
  assert.equal(box.radiators[0].values.setpoint, 18);
  assert.equal(box.radiators[1].values.setpoint, 21);

  const all = await gladys.fake.sceneAction('set_temperature', { temperature: 16.5 });
  assert.deepEqual(all.data.outputs, { updated: 2 });
  assert.deepEqual(
    box.radiators.map((radiator) => radiator.values.setpoint),
    [16.5, 16.5],
  );
  stop();
});

test('set_mode switches the radiators on, off or to frost protection', async () => {
  const { gladys, box, stop } = await startApp();
  const off = await gladys.fake.sceneAction('set_mode', { mode: 'off' });
  assert.deepEqual(off.data.outputs, { updated: 2 });
  assert.deepEqual(
    box.radiators.map((radiator) => radiator.values.hvacMode),
    ['STOP', 'STOP'],
  );
  await gladys.fake.sceneAction('set_mode', { device: BATHROOM, mode: 'heating' });
  assert.deepEqual(
    box.radiators.map((radiator) => radiator.values.hvacMode),
    ['STOP', 'NORMAL'],
  );
  stop();
});

test('set_boost skips the radiators without a boost: an output, not a failure', async () => {
  const { gladys, box, stop } = await startApp();
  const all = await gladys.fake.sceneAction('set_boost', { state: 'on' });
  assert.deepEqual(all, { success: true, data: { outputs: { updated: 1 } } });
  assert.equal(box.radiators[1].values.boostOn, true);

  const none = await gladys.fake.sceneAction('set_boost', { device: SALON, state: 'on' });
  assert.deepEqual(none.data.outputs, { updated: 0 });

  await gladys.fake.sceneAction('set_boost', { device: BATHROOM, state: 'off' });
  assert.equal(box.radiators[1].values.boostOn, false);
  stop();
});

test('refresh reads the box again and tells what it found', async () => {
  const { gladys, box, stop } = await startApp();
  box.radiators[0].values.temperature = 17.2;
  const ack = await gladys.fake.sceneAction('refresh');
  assert.deepEqual(ack.data.outputs, { radiators: 2, connection: 'local' });
  await settle();
  assert.equal(gladys.fake.lastState(`${SALON}:temperature`), 17.2);
  stop();
});

test('an action that cannot run fails that action only, with a reason', async () => {
  const { gladys, box, stop } = await startApp({ retryDelays: [60_000] });
  const unknown = await gladys.fake.sceneAction('set_mode', {
    device: `${PREFIX}-9-9`,
    mode: 'off',
  });
  assert.equal(unknown.success, false);
  const badMode = await gladys.fake.sceneAction('set_mode', { mode: 'party' });
  assert.equal(badMode.success, false);
  const badTemperature = await gladys.fake.sceneAction('set_temperature', { temperature: 'hot' });
  assert.equal(badTemperature.success, false);

  box.reachable = { local: false, cloud: false };
  box.disconnect();
  const offline = await gladys.fake.sceneAction('set_temperature', { temperature: 20 });
  assert.equal(offline.success, false);
  assert.match(offline.error, /not connected/);
  stop();
});
