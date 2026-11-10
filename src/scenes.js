// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// TRIGGERS say "this happened": the integration fires them with
// `gladys.publishSceneEvent(key, data)`, one event per transition. The values
// themselves (temperatures, window, presence...) are device features: Gladys
// already starts scenes on those. The triggers here carry what no single
// feature does — the mode of a radiator as one value, a fault, the connection.
//
// ACTIONS are operations a scene author places in a scene. Each handler
// receives the RESOLVED fields and returns the outputs declared in the
// manifest. An action is never a condition: a radiator that cannot do what is
// asked is counted out in the output, it does not fail the scene.
//
// Keys are forever: a scene stores them. Never rename one.
// -----------------------------------------------------------------------------

import { MODE } from './radiators.js';
import { tl } from './i18n.js';

export const TRIGGER = {
  MODE_CHANGED: 'radiator_mode_changed',
  FAULT: 'radiator_fault',
  CONNECTION_CHANGED: 'connection_changed',
};

// Every trigger key the code fires: each one is declared in the manifest
// `scene_triggers` (test/manifest.test.js checks both directions).
export const SCENE_TRIGGER_KEYS = Object.values(TRIGGER);

const MODES = Object.values(MODE);

/**
 * Fire the triggers a radiator change calls for.
 *
 * No loops: a change that follows a command sent by the integration itself
 * (a scene action, a dashboard tap) fires no mode trigger — a scene bound to
 * it would otherwise run in circles. A fault is never the result of a command
 * and is always reported.
 */
export async function fireRadiatorTriggers(app, { radiator, state, previous, commanded }) {
  if (!previous) {
    // First sight of the radiator: nothing changed, it was merely read.
    return;
  }
  const device = app.deviceExternalId(radiator);
  const deviceName = app.deviceName(radiator);

  if (!commanded && state.mode !== null && previous.mode !== null && state.mode !== previous.mode) {
    await app.gladys.publishSceneEvent(TRIGGER.MODE_CHANGED, {
      device,
      device_name: deviceName,
      mode: state.mode,
      previous_mode: previous.mode,
    });
  }

  for (const fault of state.faults) {
    if (!previous.faults.includes(fault)) {
      await app.gladys.publishSceneEvent(TRIGGER.FAULT, {
        device,
        device_name: deviceName,
        fault,
        fault_label: tl(`fault.${fault}`, app.config.language),
      });
    }
  }
}

/** Fire the connection trigger when the channel in use changes. */
export async function fireConnectionTrigger(app, status, previous) {
  if (status.transport === previous.transport) {
    return;
  }
  await app.gladys.publishSceneEvent(TRIGGER.CONNECTION_CHANGED, {
    status: status.transport,
    previous_status: previous.transport,
  });
}

// The radiators an action targets: the chosen device, or all of them when the
// field is left empty.
function targets(app, deviceExternalId) {
  if (!deviceExternalId) {
    return [...app.bridge.radiators.keys()];
  }
  const radiator = app.radiatorByDevice(deviceExternalId);
  if (!radiator) {
    throw new Error(`Unknown radiator: ${deviceExternalId}`);
  }
  return [radiator.key];
}

export const SCENE_ACTIONS = {
  // Set the target temperature of one radiator, or of all of them.
  async set_temperature(app, fields) {
    const temperature = Number(fields.temperature);
    if (!Number.isFinite(temperature)) {
      throw new Error('The temperature must be a number');
    }
    const updated = await app.bridge.forEach(targets(app, fields.device), (key) =>
      app.bridge.setTemperature(key, temperature),
    );
    return { updated };
  },

  // Put one radiator, or all of them, in a mode.
  async set_mode(app, fields) {
    if (!MODES.includes(fields.mode)) {
      throw new Error(`Unknown mode: ${fields.mode}`);
    }
    const updated = await app.bridge.forEach(targets(app, fields.device), (key) =>
      app.bridge.setMode(key, fields.mode),
    );
    return { updated };
  },

  // Start or stop the boost of the radiators that have one.
  async set_boost(app, fields) {
    const on = fields.state !== 'off';
    const updated = await app.bridge.forEach(targets(app, fields.device), (key) =>
      app.bridge.setBoost(key, on),
    );
    return { updated };
  },

  // Read every value again, without waiting for the next periodic refresh.
  async refresh(app) {
    await app.bridge.refresh();
    return { radiators: app.bridge.radiators.size, connection: app.bridge.status.transport };
  },
};
