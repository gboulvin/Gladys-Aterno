// -----------------------------------------------------------------------------
// Radiators as Gladys devices: discovery payload, states, commands.
//
// One Gladys device per radiator paired with the box. A feature only exists
// when the radiator reports the matching value (a bathroom model has a boost,
// a living-room one does not).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { BridgeError } from './bridge.js';
import { tl } from './i18n.js';
import { MODE, capabilities, setpointRange } from './radiators.js';

const DEVICE_TYPE = 'radiator';

// Feature keys: part of the external ids, never rename one.
export const FEATURE = {
  TARGET: 'target-temperature',
  TEMPERATURE: 'temperature',
  MODE: 'mode',
  FROST: 'frost-protection',
  BOOST: 'boost',
  WINDOW: 'window',
  PRESENCE: 'presence',
};

// Values of the Gladys core (server/utils/constants.js), not exported by the SDK.
const THERMOSTAT_MODE = { OFF: 0, HEATING: 1 };
const OPENING_SENSOR_STATE = { OPEN: 0, CLOSE: 1 };

// External ids are forever: built from what identifies the radiator on the
// box (MAC address of the box + device and endpoint ids), never from a name.
export function radiatorIds(gladys, config, radiator) {
  return gladys.externalIds(DEVICE_TYPE, `${config.mac.toLowerCase()}-${radiator.key}`);
}

export function deviceName(radiator) {
  const { name, room } = radiator;
  return room && !name.toLowerCase().includes(room.toLowerCase()) ? `${room} - ${name}` : name;
}

/** Discovery payload of one radiator. */
export function buildDevice(gladys, config, radiator) {
  const ids = radiatorIds(gladys, config, radiator);
  const caps = capabilities(radiator);
  const { language } = config;
  const features = [];
  const feature = (key, name, definition) =>
    features.push({
      name: tl(name, language),
      external_id: ids.feature(key),
      has_feedback: true,
      keep_history: true,
      ...definition,
    });

  if (caps.setpoint) {
    const { min, max } = setpointRange(radiator);
    feature(FEATURE.TARGET, 'feature.target', {
      category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
      type: DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      read_only: false,
      min,
      max,
    });
  }
  if (caps.temperature) {
    feature(FEATURE.TEMPERATURE, 'feature.temperature', {
      category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      read_only: true,
      min: -20,
      max: 60,
    });
  }
  if (caps.mode) {
    feature(FEATURE.MODE, 'feature.mode', {
      category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
      type: DEVICE_FEATURE_TYPES.THERMOSTAT.MODE,
      read_only: false,
      min: THERMOSTAT_MODE.OFF,
      max: THERMOSTAT_MODE.HEATING,
    });
  }
  if (caps.frost) {
    feature(FEATURE.FROST, 'feature.frost', {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      min: 0,
      max: 1,
    });
  }
  if (caps.boost) {
    feature(FEATURE.BOOST, 'feature.boost', {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      min: 0,
      max: 1,
    });
  }
  if (caps.window) {
    feature(FEATURE.WINDOW, 'feature.window', {
      category: DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      min: 0,
      max: 1,
    });
  }
  if (caps.presence) {
    feature(FEATURE.PRESENCE, 'feature.presence', {
      category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      min: 0,
      max: 1,
    });
  }

  return { name: deviceName(radiator), external_id: ids.device, features };
}

/**
 * States to publish for a radiator. A value the box does not report (null)
 * is left out: Gladys keeps the last known one.
 */
export function buildStates(gladys, config, radiator, state) {
  const ids = radiatorIds(gladys, config, radiator);
  const caps = capabilities(radiator);
  const states = [];
  const add = (key, value) => {
    if (value !== null && value !== undefined) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  };

  add(FEATURE.TARGET, state.setpoint);
  add(FEATURE.TEMPERATURE, state.temperature);
  if (state.mode !== null) {
    // Frost protection is a way of heating: the unit is not stopped.
    if (caps.mode) {
      add(FEATURE.MODE, state.mode === MODE.OFF ? THERMOSTAT_MODE.OFF : THERMOSTAT_MODE.HEATING);
    }
    if (caps.frost) {
      add(FEATURE.FROST, state.mode === MODE.FROST ? 1 : 0);
    }
  }
  if (state.boost !== null) {
    add(FEATURE.BOOST, state.boost ? 1 : 0);
  }
  if (state.windowOpen !== null) {
    add(FEATURE.WINDOW, state.windowOpen ? OPENING_SENSOR_STATE.OPEN : OPENING_SENSOR_STATE.CLOSE);
  }
  if (state.presence !== null) {
    add(FEATURE.PRESENCE, state.presence ? 1 : 0);
  }
  return states;
}

/** Run a command Gladys sent on a feature of a radiator. */
export async function setFeatureValue(bridge, radiator, featureKey, value) {
  switch (featureKey) {
    case FEATURE.TARGET:
      return bridge.setTemperature(radiator.key, Number(value));
    case FEATURE.MODE:
      return bridge.setMode(
        radiator.key,
        Number(value) === THERMOSTAT_MODE.OFF ? MODE.OFF : MODE.HEATING,
      );
    case FEATURE.FROST:
      return bridge.setMode(radiator.key, Number(value) === 1 ? MODE.FROST : MODE.HEATING);
    case FEATURE.BOOST:
      return bridge.setBoost(radiator.key, Number(value) === 1);
    default:
      throw new BridgeError('unsupported', `The feature "${featureKey}" cannot be controlled`);
  }
}
