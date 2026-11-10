import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODE,
  applyData,
  boostCommands,
  buildRadiators,
  capabilities,
  clampSetpoint,
  modeCommands,
  radiatorState,
  setpointCommands,
  setpointRange,
} from '../src/radiators.js';
import { createFakeBox } from './helpers/fakeBox.js';

// The radiators as the integration builds them from a (simulated) box.
function load(box = createFakeBox()) {
  return buildRadiators({
    configFile: box.answer('GET', '/configs/file'),
    groupsFile: box.answer('GET', '/groups/file'),
    meta: box.answer('GET', '/devices/meta'),
    data: box.answer('GET', '/devices/data'),
  });
}

// A radiator described by its values only: no metadata from the box.
const bare = (values) => ({ key: '1-1', name: 'R', room: null, meta: {}, values });

test('builds one radiator per heating endpoint, with its room', () => {
  const radiators = load();
  assert.deepEqual([...radiators.keys()], ['1001-1001', '1002-1002']);
  const salon = radiators.get('1001-1001');
  assert.equal(salon.name, 'Radiateur salon');
  assert.equal(salon.room, 'Salon');
  assert.equal(radiators.get('1002-1002').room, 'Salle de bain');
});

test('ignores what is not a radiator, keeps an oddly filed one that has a setpoint', () => {
  const radiators = buildRadiators({
    configFile: {
      endpoints: [
        { id_endpoint: 1, id_device: 1, name: 'Volet', last_usage: 'shutter' },
        { id_endpoint: 2, id_device: 2, name: 'Mystère', last_usage: 'others' },
        { id_endpoint: 3, id_device: 3, name: '', last_usage: 'electric' },
        { name: 'broken' },
      ],
    },
    data: [
      { id: 1, endpoints: [{ id: 1, data: [{ name: 'position', value: 50 }] }] },
      { id: 2, endpoints: [{ id: 2, data: [{ name: 'setpoint', value: 19 }] }] },
    ],
  });
  assert.deepEqual([...radiators.keys()], ['2-2', '3-3']);
  // No name on the box: still a usable one. No groups, no metadata: fine too.
  assert.equal(radiators.get('3-3').name, 'Radiator 3');
  assert.equal(radiators.get('2-2').room, null);
});

test('survives a box that describes nothing', () => {
  assert.equal(buildRadiators({ configFile: null }).size, 0);
  assert.equal(buildRadiators({ configFile: {}, data: 'oops', meta: 12 }).size, 0);
});

test('capabilities follow the values the endpoint carries', () => {
  const radiators = load();
  assert.deepEqual(capabilities(radiators.get('1001-1001')), {
    setpoint: true,
    temperature: true,
    mode: true,
    frost: true,
    boost: false,
    window: true,
    presence: true,
  });
  const bathroom = capabilities(radiators.get('1002-1002'));
  assert.equal(bathroom.boost, true);
  assert.equal(bathroom.presence, false);
});

test('reads the state of a radiator', () => {
  const state = radiatorState(load().get('1001-1001'));
  assert.deepEqual(state, {
    mode: MODE.HEATING,
    setpoint: 19.5,
    temperature: 20.1,
    boost: null,
    windowOpen: false,
    presence: true,
    faults: [],
  });
});

test('reads the mode from whatever the box uses to express it', () => {
  const mode = (values) => radiatorState(bare(values)).mode;
  assert.equal(mode({ hvacMode: 'NORMAL', antifrostOn: false }), MODE.HEATING);
  assert.equal(mode({ hvacMode: 'STOP' }), MODE.OFF);
  // Frost protection armed on a stopped unit: it is stopped.
  assert.equal(mode({ hvacMode: 'STOP', antifrostOn: true }), MODE.OFF);
  assert.equal(mode({ hvacMode: 'ANTI_FROST' }), MODE.FROST);
  assert.equal(mode({ hvacMode: 'NORMAL', antifrostOn: true }), MODE.FROST);
  assert.equal(mode({ authorization: 'STOP', setpoint: 19 }), MODE.OFF);
  assert.equal(mode({ authorization: 'HEATING' }), MODE.HEATING);
  assert.equal(mode({ thermicLevel: 'ANTI_FROST' }), MODE.FROST);
  assert.equal(mode({ thermicLevel: 'STOP' }), MODE.OFF);
  assert.equal(mode({ thermicLevel: 'COMFORT' }), MODE.HEATING);
  // Nothing about a mode: the integration does not invent one.
  assert.equal(mode({ temperature: 20 }), null);
});

test('missing values are null, faults are named once', () => {
  const state = radiatorState(
    bare({
      setpoint: null,
      temperature: '20.5',
      openingDetected: null,
      tempSensorDefect: true,
      tempSensorShortCut: true,
      batteryCmdDefect: true,
      productionDefect: false,
    }),
  );
  assert.equal(state.setpoint, null);
  assert.equal(state.temperature, 20.5);
  assert.equal(state.windowOpen, null);
  assert.deepEqual(state.faults, ['temperature_sensor', 'battery']);
});

test('merges pushed values and reports which radiators changed', () => {
  const radiators = load();
  const push = (value) => [
    { id: 1001, endpoints: [{ id: 1001, error: 0, data: [{ name: 'setpoint', value }] }] },
    { id: 9999, endpoints: [{ id: 9999, error: 0, data: [{ name: 'setpoint', value }] }] },
  ];
  assert.deepEqual(applyData(radiators, push(22)), ['1001-1001']);
  assert.equal(radiatorState(radiators.get('1001-1001')).setpoint, 22);
  // The same value again changes nothing; other values were kept.
  assert.deepEqual(applyData(radiators, push(22)), []);
  assert.equal(radiatorState(radiators.get('1001-1001')).temperature, 20.1);
  assert.deepEqual(applyData(radiators, null), []);
});

test('the target temperature follows the range of the box', () => {
  const radiator = load().get('1001-1001');
  assert.deepEqual(setpointRange(radiator), { min: 10, max: 30, step: 0.5 });
  assert.equal(clampSetpoint(radiator, 20.26), 20.5);
  assert.equal(clampSetpoint(radiator, 3), 10);
  assert.equal(clampSetpoint(radiator, 45), 30);
  assert.deepEqual(setpointCommands(radiator, 21.2), [{ name: 'setpoint', value: 21 }]);
  // Without metadata: a sensible default range.
  assert.deepEqual(setpointRange(bare({ setpoint: 19 })), { min: 5, max: 30, step: 0.5 });
});

test('mode commands of a receiver driven by hvacMode', () => {
  const radiator = load().get('1001-1001');
  assert.deepEqual(modeCommands(radiator, MODE.OFF), [{ name: 'hvacMode', value: 'STOP' }]);
  assert.deepEqual(modeCommands(radiator, MODE.HEATING), [
    { name: 'hvacMode', value: 'NORMAL' },
    { name: 'antifrostOn', value: false },
  ]);
  assert.deepEqual(modeCommands(radiator, MODE.FROST), [
    { name: 'hvacMode', value: 'ANTI_FROST' },
    { name: 'antifrostOn', value: true },
  ]);
});

test('mode commands of a receiver driven by thermicLevel', () => {
  const radiator = {
    ...bare({ thermicLevel: 'ECO', authorization: 'HEATING' }),
    meta: {
      thermicLevel: { permission: 'rw', enum_values: ['STOP', 'ANTI_FROST', 'ECO', 'COMFORT'] },
      authorization: { permission: 'r' },
    },
  };
  assert.deepEqual(modeCommands(radiator, MODE.OFF), [{ name: 'thermicLevel', value: 'STOP' }]);
  assert.deepEqual(modeCommands(radiator, MODE.HEATING), [
    { name: 'thermicLevel', value: 'COMFORT' },
  ]);
  assert.deepEqual(modeCommands(radiator, MODE.FROST), [
    { name: 'thermicLevel', value: 'ANTI_FROST' },
  ]);
});

test('never writes what the box declares read-only or does not accept', () => {
  const readOnly = {
    ...bare({ setpoint: 19, hvacMode: 'NORMAL', boostOn: false }),
    meta: {
      setpoint: { permission: 'r' },
      hvacMode: { permission: 'rw', enum_values: ['NORMAL', 'STOP'] },
      boostOn: { permission: 'r' },
    },
  };
  assert.deepEqual(setpointCommands(readOnly, 21), []);
  assert.deepEqual(boostCommands(readOnly, true), []);
  // ANTI_FROST is not among the values this receiver accepts.
  assert.deepEqual(modeCommands(readOnly, MODE.FROST), []);
  // No boost at all on a living-room radiator.
  assert.deepEqual(boostCommands(load().get('1001-1001'), true), []);
  assert.deepEqual(boostCommands(load().get('1002-1002'), true), [
    { name: 'boostOn', value: true },
  ]);
});
