// -----------------------------------------------------------------------------
// A simulated Eco Aterno box, for the tests. No network involved.
//
// `createFakeBox()` holds the state of a box (radiators, values) and answers
// the requests the integration sends, in the shape the real box uses. Its
// `createClient` is passed to createApp / AternoBridge in place of the real
// TydomClient factory; `box.push(...)` plays a change made from the Eco Aterno
// app or a thermostat.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { TydomAuthError } from '../../src/tydom/client.js';

export const MAC = '001A25ABCDEF';
export const PASSWORD = 'secret';

const value = (name, v) => ({ name, validity: 'upToDate', value: v });

// A living-room radiator and a bathroom one (with a boost), in two rooms.
export function defaultRadiators() {
  return [
    {
      deviceId: 1001,
      endpointId: 1001,
      name: 'Radiateur salon',
      room: 'Salon',
      usage: 'electric',
      values: {
        authorization: 'HEATING',
        setpoint: 19.5,
        thermicLevel: null,
        hvacMode: 'NORMAL',
        temperature: 20.1,
        antifrostOn: false,
        openingDetected: false,
        presenceDetected: true,
        tempSensorDefect: false,
        productionDefect: false,
        batteryCmdDefect: false,
      },
    },
    {
      deviceId: 1002,
      endpointId: 1002,
      name: 'Sèche-serviettes',
      room: 'Salle de bain',
      usage: 'electric',
      values: {
        authorization: 'HEATING',
        setpoint: 21,
        hvacMode: 'NORMAL',
        temperature: 22.4,
        antifrostOn: false,
        boostOn: false,
        openingDetected: false,
        tempSensorDefect: false,
      },
    },
  ];
}

const META = {
  setpoint: { name: 'setpoint', type: 'numeric', permission: 'rw', min: 10, max: 30, step: 0.5 },
  hvacMode: {
    name: 'hvacMode',
    type: 'string',
    permission: 'rw',
    enum_values: ['NORMAL', 'STOP', 'ANTI_FROST'],
  },
  antifrostOn: { name: 'antifrostOn', type: 'boolean', permission: 'rw' },
  boostOn: { name: 'boostOn', type: 'boolean', permission: 'rw' },
  temperature: { name: 'temperature', type: 'numeric', permission: 'r', min: -99.9, max: 99.9 },
  authorization: { name: 'authorization', type: 'string', permission: 'r' },
  openingDetected: { name: 'openingDetected', type: 'boolean', permission: 'r' },
  presenceDetected: { name: 'presenceDetected', type: 'boolean', permission: 'r' },
};

export function createFakeBox({ radiators = defaultRadiators(), password = PASSWORD } = {}) {
  const box = {
    radiators,
    password,
    // Channels that currently answer.
    reachable: { local: true, cloud: true },
    // Every client created, every request received (`{ transport, method, url, body }`).
    clients: [],
    requests: [],
    // Push the changes back like the real box does after a write.
    echoWrites: true,

    find(deviceId, endpointId) {
      return box.radiators.find((r) => r.deviceId === deviceId && r.endpointId === endpointId);
    },

    devicesData(only) {
      return box.radiators
        .filter((r) => !only || only.includes(r))
        .map((r) => ({
          id: r.deviceId,
          endpoints: [
            {
              id: r.endpointId,
              error: 0,
              data: Object.entries(r.values).map(([name, v]) => value(name, v)),
            },
          ],
        }));
    },

    answer(method, url, body) {
      if (method === 'GET' && url === '/info') {
        return { productName: 'TYDOM1', mac: MAC, mainVersionSW: '03.12.30' };
      }
      if (method === 'GET' && url === '/ping') {
        return null;
      }
      if (method === 'POST' && url === '/refresh/all') {
        return null;
      }
      if (method === 'GET' && url === '/configs/file') {
        const rooms = [...new Set(box.radiators.map((r) => r.room).filter(Boolean))];
        return {
          endpoints: box.radiators.map((r) => ({
            id_endpoint: r.endpointId,
            id_device: r.deviceId,
            name: r.name,
            first_usage: 'hvac',
            last_usage: r.usage,
          })),
          groups: [
            { id: 1, name: 'TOTAL', usage: 'hvac', group_all: true },
            ...rooms.map((name, index) => ({ id: 10 + index, name, usage: 'hvac' })),
          ],
        };
      }
      if (method === 'GET' && url === '/groups/file') {
        const rooms = [...new Set(box.radiators.map((r) => r.room).filter(Boolean))];
        return {
          groups: rooms.map((name, index) => ({
            id: 10 + index,
            devices: box.radiators
              .filter((r) => r.room === name)
              .map((r) => ({ id: r.deviceId, endpoints: [{ id: r.endpointId }] })),
          })),
        };
      }
      if (method === 'GET' && url === '/devices/meta') {
        return box.radiators.map((r) => ({
          id: r.deviceId,
          endpoints: [
            {
              id: r.endpointId,
              error: 0,
              metadata: Object.keys(r.values)
                .filter((name) => META[name])
                .map((name) => META[name]),
            },
          ],
        }));
      }
      if (method === 'GET' && url === '/devices/data') {
        return box.devicesData();
      }
      const write = /^\/devices\/(\d+)\/endpoints\/(\d+)\/data$/.exec(url);
      if (method === 'PUT' && write) {
        const radiator = box.find(Number(write[1]), Number(write[2]));
        if (!radiator) {
          throw new Error(`${method} ${url} failed: HTTP 404`);
        }
        for (const entry of body) {
          radiator.values[entry.name] = entry.value;
        }
        if (box.echoWrites) {
          queueMicrotask(() => box.push(radiator, {}));
        }
        return null;
      }
      throw new Error(`${method} ${url} failed: HTTP 404`);
    },

    /** A change made outside Gladys: update the values and push them. */
    push(radiator, values) {
      Object.assign(radiator.values, values);
      for (const client of box.clients) {
        if (client.connected) {
          client.emit('push', {
            type: 'request',
            method: 'PUT',
            uri: '/devices/data',
            body: box.devicesData([radiator]),
          });
        }
      }
    },

    /** Cut every open connection (the box rebooted, the network dropped). */
    disconnect() {
      for (const client of box.clients) {
        client.close();
      }
    },

    createClient(options) {
      const client = new FakeClient(box, options);
      box.clients.push(client);
      return client;
    },
  };
  return box;
}

class FakeClient extends EventEmitter {
  constructor(box, options) {
    super();
    this.box = box;
    this.options = options;
    this.transport = options.transport;
    this.connected = false;
  }

  async connect() {
    if (!this.box.reachable[this.transport]) {
      throw new Error(`connect ECONNREFUSED ${this.options.host}`);
    }
    if (this.options.password !== this.box.password || this.options.mac !== MAC) {
      throw new TydomAuthError();
    }
    this.connected = true;
  }

  async request(method, url, body) {
    if (!this.connected) {
      throw new Error('Not connected to the box');
    }
    this.box.requests.push({ transport: this.transport, method, url, body });
    return this.box.answer(method, url, body);
  }

  get(url) {
    return this.request('GET', url);
  }

  put(url, body) {
    return this.request('PUT', url, body);
  }

  post(url, body) {
    return this.request('POST', url, body);
  }

  close() {
    if (this.connected) {
      this.connected = false;
      this.emit('close');
    }
  }
}
