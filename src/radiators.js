// -----------------------------------------------------------------------------
// Radiator model: what the box says, turned into what the integration means.
//
// The box describes every paired receiver as an "endpoint" carrying named
// values (`setpoint`, `temperature`, `hvacMode`, `antifrostOn`, `boostOn`,
// `openingDetected`...). Which values exist depends on the receiver: nothing
// is assumed here, a radiator only offers what its endpoint reports, and a
// command is only sent on a value the box declares writable.
//
// Pure functions, no I/O: the bridge (src/bridge.js) feeds them.
// -----------------------------------------------------------------------------

export const MODE = { OFF: 'off', HEATING: 'heating', FROST: 'frost' };

// Endpoint usages the box gives to heating receivers.
const HEATING_USAGES = new Set(['electric', 'boiler', 'sh_hvac', 'hvac']);

// Box value -> fault reported by the integration.
const FAULT_VALUES = {
  tempSensorDefect: 'temperature_sensor',
  tempSensorShortCut: 'temperature_sensor',
  tempSensorOpenCirc: 'temperature_sensor',
  productionDefect: 'heating',
  batteryCmdDefect: 'battery',
};
export const FAULTS = [...new Set(Object.values(FAULT_VALUES))];

const DEFAULT_SETPOINT_RANGE = { min: 5, max: 30, step: 0.5 };

export const radiatorKey = (deviceId, endpointId) => `${deviceId}-${endpointId}`;

const asArray = (value) => (Array.isArray(value) ? value : []);

// `[{ name, value }]` -> `{ name: value }`.
function toValueMap(entries) {
  const values = {};
  for (const entry of asArray(entries)) {
    if (entry && typeof entry.name === 'string') {
      values[entry.name] = entry.value ?? null;
    }
  }
  return values;
}

// Walk a `/devices/data` or `/devices/meta` payload: one callback per endpoint.
// The box sends the full tree on a GET and a pruned one in its pushes.
function forEachEndpoint(payload, callback) {
  for (const device of asArray(payload)) {
    for (const endpoint of asArray(device?.endpoints)) {
      if (device.id !== undefined && endpoint?.id !== undefined) {
        callback(device.id, endpoint);
      }
    }
  }
}

// Room (the "pièces" of the Eco Aterno app are heating groups of the box) of
// every endpoint: `{ radiatorKey: roomName }`. Best effort: a box without
// groups simply names no room.
function roomsByEndpoint(configFile, groupsFile) {
  const names = new Map();
  for (const group of asArray(configFile?.groups)) {
    // `group_all` is the built-in "everything" group, not a room.
    if (group?.id !== undefined && group.name && !group.group_all) {
      names.set(group.id, String(group.name));
    }
  }
  const rooms = {};
  for (const group of asArray(groupsFile?.groups)) {
    const name = names.get(group?.id);
    if (!name) {
      continue;
    }
    forEachEndpoint(group.devices, (deviceId, endpoint) => {
      rooms[radiatorKey(deviceId, endpoint.id)] ??= name;
    });
  }
  return rooms;
}

/**
 * Build the radiators from the description files of the box.
 * @param {object} files
 * @param {object} files.configFile `GET /configs/file`
 * @param {object} [files.groupsFile] `GET /groups/file`
 * @param {Array} [files.meta] `GET /devices/meta`
 * @param {Array} [files.data] `GET /devices/data`
 * @returns {Map<string, object>} radiators by key
 */
export function buildRadiators({ configFile, groupsFile, meta, data }) {
  const values = new Map();
  forEachEndpoint(data, (deviceId, endpoint) => {
    values.set(radiatorKey(deviceId, endpoint.id), toValueMap(endpoint.data));
  });
  const metadata = new Map();
  forEachEndpoint(meta, (deviceId, endpoint) => {
    const byName = {};
    for (const entry of asArray(endpoint.metadata)) {
      if (entry && typeof entry.name === 'string') {
        byName[entry.name] = entry;
      }
    }
    metadata.set(radiatorKey(deviceId, endpoint.id), byName);
  });
  const rooms = roomsByEndpoint(configFile, groupsFile);

  const radiators = new Map();
  for (const endpoint of asArray(configFile?.endpoints)) {
    if (endpoint?.id_device === undefined || endpoint?.id_endpoint === undefined) {
      continue;
    }
    const key = radiatorKey(endpoint.id_device, endpoint.id_endpoint);
    const endpointValues = values.get(key) ?? {};
    const isHeating =
      HEATING_USAGES.has(endpoint.last_usage) || HEATING_USAGES.has(endpoint.first_usage);
    // A receiver the box filed under an unexpected usage is still a radiator
    // when it carries a setpoint.
    if (!isHeating && !('setpoint' in endpointValues)) {
      continue;
    }
    radiators.set(key, {
      key,
      deviceId: endpoint.id_device,
      endpointId: endpoint.id_endpoint,
      name: String(endpoint.name || '').trim() || `Radiator ${endpoint.id_endpoint}`,
      room: rooms[key] ?? null,
      meta: metadata.get(key) ?? {},
      values: endpointValues,
    });
  }
  return radiators;
}

/**
 * Merge a `/devices/data` payload (a GET answer or a push of the box) into
 * the radiators.
 * @returns {string[]} keys of the radiators whose values changed
 */
export function applyData(radiators, payload) {
  const changed = [];
  forEachEndpoint(payload, (deviceId, endpoint) => {
    const radiator = radiators.get(radiatorKey(deviceId, endpoint.id));
    if (!radiator) {
      return;
    }
    let dirty = false;
    for (const [name, value] of Object.entries(toValueMap(endpoint.data))) {
      if (radiator.values[name] !== value) {
        radiator.values[name] = value;
        dirty = true;
      }
    }
    if (dirty) {
      changed.push(radiator.key);
    }
  });
  return changed;
}

const has = (radiator, name) => name in radiator.values || name in radiator.meta;

// Can this value be written? The metadata of the box says so when it knows
// the value; a value it reports without metadata is given the benefit of the
// doubt (the box answers an error, the command fails loudly).
function writable(radiator, name) {
  const meta = radiator.meta[name];
  if (meta?.permission !== undefined) {
    return String(meta.permission).includes('w');
  }
  return name in radiator.values;
}

const accepts = (radiator, name, value) => {
  const allowed = radiator.meta[name]?.enum_values;
  return writable(radiator, name) && (!Array.isArray(allowed) || allowed.includes(value));
};

const toNumber = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

const toBoolean = (value) => (typeof value === 'boolean' ? value : null);

/** What a radiator can do, from the values its endpoint carries. */
export function capabilities(radiator) {
  return {
    setpoint: has(radiator, 'setpoint'),
    temperature: has(radiator, 'temperature'),
    mode: ['hvacMode', 'authorization', 'thermicLevel', 'comfortMode'].some((name) =>
      has(radiator, name),
    ),
    frost: has(radiator, 'antifrostOn') || has(radiator, 'hvacMode'),
    boost: has(radiator, 'boostOn'),
    window: has(radiator, 'openingDetected'),
    presence: has(radiator, 'presenceDetected'),
  };
}

/** Allowed range of the target temperature, from the box when it says. */
export function setpointRange(radiator) {
  const meta = radiator.meta.setpoint ?? {};
  const min = toNumber(meta.min) ?? DEFAULT_SETPOINT_RANGE.min;
  const max = toNumber(meta.max) ?? DEFAULT_SETPOINT_RANGE.max;
  const step = toNumber(meta.step) ?? DEFAULT_SETPOINT_RANGE.step;
  return max > min ? { min, max, step } : { ...DEFAULT_SETPOINT_RANGE };
}

/**
 * The state of a radiator, in the integration's own terms.
 * `null` means "the box does not say" — never published, never compared.
 */
export function radiatorState(radiator) {
  const v = radiator.values;
  const caps = capabilities(radiator);

  let mode = null;
  if (caps.mode || caps.frost) {
    const stopped =
      v.hvacMode === 'STOP' ||
      v.authorization === 'STOP' ||
      v.thermicLevel === 'STOP' ||
      v.comfortMode === 'STOP';
    const frost =
      v.hvacMode === 'ANTI_FROST' || v.thermicLevel === 'ANTI_FROST' || v.antifrostOn === true;
    // `hvacMode` is the mode the app sets: it wins over the helper flags the
    // box raises next to it (frost protection stays armed on a stopped unit).
    if (v.hvacMode === 'ANTI_FROST') {
      mode = MODE.FROST;
    } else if (v.hvacMode === 'STOP') {
      mode = MODE.OFF;
    } else if (frost) {
      mode = MODE.FROST;
    } else if (stopped) {
      mode = MODE.OFF;
    } else {
      mode = MODE.HEATING;
    }
  }

  const faults = [];
  for (const [name, fault] of Object.entries(FAULT_VALUES)) {
    if (v[name] === true && !faults.includes(fault)) {
      faults.push(fault);
    }
  }

  return {
    mode,
    setpoint: caps.setpoint ? toNumber(v.setpoint) : null,
    temperature: caps.temperature ? toNumber(v.temperature) : null,
    boost: caps.boost ? toBoolean(v.boostOn) : null,
    windowOpen: caps.window ? toBoolean(v.openingDetected) : null,
    presence: caps.presence ? toBoolean(v.presenceDetected) : null,
    faults,
  };
}

/** Clamp and round a target temperature to what the radiator accepts. */
export function clampSetpoint(radiator, value) {
  const { min, max, step } = setpointRange(radiator);
  const rounded = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, Number(rounded.toFixed(2))));
}

/**
 * The writes that put a radiator in a mode, in the order to send them.
 * Follows what the box expects from its own apps: receivers exposing
 * `hvacMode` are driven through it, older fil-pilote ones through
 * `thermicLevel` / `comfortMode`.
 * @returns {{ name: string, value: unknown }[]} empty when the radiator
 *   offers no way to reach the mode
 */
export function modeCommands(radiator, mode) {
  const commands = [];
  const add = (name, value) => {
    if (accepts(radiator, name, value)) {
      commands.push({ name, value });
    }
  };

  if (has(radiator, 'hvacMode')) {
    if (mode === MODE.FROST) {
      add('hvacMode', 'ANTI_FROST');
      add('antifrostOn', true);
    } else if (mode === MODE.OFF) {
      add('hvacMode', 'STOP');
    } else {
      add('hvacMode', 'NORMAL');
      add('antifrostOn', false);
    }
    return commands;
  }

  if (mode === MODE.FROST) {
    add('thermicLevel', 'ANTI_FROST');
    add('antifrostOn', true);
  } else if (mode === MODE.OFF) {
    add('thermicLevel', 'STOP');
    add('comfortMode', 'STOP');
    if (commands.length === 0) {
      add('authorization', 'STOP');
    }
  } else {
    const levels = radiator.meta.thermicLevel?.enum_values;
    if (Array.isArray(levels)) {
      add('thermicLevel', levels.includes('COMFORT') ? 'COMFORT' : 'HEATING');
    }
    add('comfortMode', 'HEATING');
    if (commands.length === 0) {
      add('authorization', 'HEATING');
    }
    add('antifrostOn', false);
  }
  return commands;
}

/** The write that sets the target temperature (empty when not writable). */
export function setpointCommands(radiator, value) {
  return writable(radiator, 'setpoint')
    ? [{ name: 'setpoint', value: clampSetpoint(radiator, value) }]
    : [];
}

/** The write that starts or stops the boost (empty when there is none). */
export function boostCommands(radiator, on) {
  return writable(radiator, 'boostOn') ? [{ name: 'boostOn', value: Boolean(on) }] : [];
}
