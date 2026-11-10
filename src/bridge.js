// -----------------------------------------------------------------------------
// The bridge: one live connection to the Eco Aterno box, kept up.
//
// It owns everything that is about the box and nothing that is about Gladys:
//   - which channel to use (local network or cloud relay), following the
//     user's preference, falling back on the other one and saying so;
//   - reconnecting when the connection drops, without hammering;
//   - the radiators (src/radiators.js) and their live values, refreshed by the
//     pushes of the box and by a periodic full read;
//   - sending the commands.
//
// Events:
//   'status'    (status, previous)  the channel in use changed
//   'radiators' ()                  the list of radiators was (re)loaded
//   'state'     ({ radiator, state, previous, commanded })  a radiator changed;
//               `previous` is undefined the first time it is seen, `commanded`
//               is true when the change follows a command sent from here
//   'refreshed' ()                  a full read just completed
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { isConfigured } from './config.js';
import { TRANSPORT, TydomAuthError } from './tydom/client.js';
import {
  applyData,
  boostCommands,
  buildRadiators,
  modeCommands,
  radiatorState,
  setpointCommands,
} from './radiators.js';

export const UNREACHABLE = 'unreachable';

// Why the status is what it is; translated in src/i18n.js.
export const REASON = {
  NOT_CONFIGURED: 'not_configured',
  AUTH: 'auth',
  UNREACHABLE: 'unreachable',
  LOCAL_FAILED: 'local_failed',
  CLOUD_FAILED: 'cloud_failed',
};

// A command that cannot be carried out, with a reason the user can read.
export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

const DEFAULTS = {
  // Delay before each reconnection attempt; the last one repeats.
  retryDelays: [5_000, 15_000, 30_000, 60_000, 120_000, 300_000],
  // While on the fallback channel, how often to try the preferred one again.
  preferredRetryDelay: 600_000,
  // A change seen this soon after a command is attributed to the command.
  commandWindow: 15_000,
  // Delay before reading the values back after a command.
  confirmDelay: 2_000,
};

const INITIAL_STATUS = { transport: UNREACHABLE, degraded: false, reason: REASON.NOT_CONFIGURED };

export class AternoBridge extends EventEmitter {
  /**
   * @param {object} options
   * @param {(options: object) => import('./tydom/client.js').TydomClient} options.createClient
   * @param {object} [options.logger]
   */
  constructor({ createClient, logger, ...timing }) {
    super();
    this.createClient = createClient;
    this.logger = logger;
    this.timing = { ...DEFAULTS, ...timing };
    this.config = null;
    this.client = null;
    this.status = { ...INITIAL_STATUS };
    this.info = null;
    this.radiators = new Map();
    this.lastStates = new Map();
    this.commandedAt = new Map();
    this.running = false;
    // Bumped on every start/stop: an attempt still in flight from before
    // notices it and bows out.
    this.generation = 0;
    this.attempts = 0;
    this.connecting = null;
    this.timers = { retry: null, preferred: null, refresh: null, confirm: null };
  }

  get connected() {
    return this.client !== null && this.client.connected;
  }

  // --- Lifecycle -------------------------------------------------------------

  /** (Re)start with a configuration. Resolves after the first attempt. */
  async start(config) {
    this.stop();
    this.config = config;
    this.running = true;
    this.attempts = 0;
    if (!isConfigured(config)) {
      this.setStatus({ transport: UNREACHABLE, degraded: false, reason: REASON.NOT_CONFIGURED });
      return;
    }
    await this.connect();
  }

  /** Close the connection and stop every timer. */
  stop() {
    this.running = false;
    this.generation += 1;
    this.connecting = null;
    for (const name of Object.keys(this.timers)) {
      clearTimeout(this.timers[name]);
      clearInterval(this.timers[name]);
      this.timers[name] = null;
    }
    this.dropClient();
  }

  dropClient() {
    const client = this.client;
    this.client = null;
    if (client) {
      client.removeAllListeners('close');
      client.removeAllListeners('push');
      client.close();
    }
  }

  // --- Connection ------------------------------------------------------------

  // Channels to try, preferred first. Local needs the address of the box.
  channels() {
    const { host, mediation_host: mediationHost, GLADYS_PREFER_LOCAL: preferLocal } = this.config;
    const cloud = { transport: TRANSPORT.CLOUD, host: mediationHost };
    if (!host) {
      return [cloud];
    }
    const local = { transport: TRANSPORT.LOCAL, host };
    return preferLocal ? [local, cloud] : [cloud, local];
  }

  /** One round of attempts over the channels. Never throws. */
  connect() {
    if (!this.connecting) {
      const round = this.connectRound().finally(() => {
        if (this.connecting === round) {
          this.connecting = null;
        }
      });
      this.connecting = round;
    }
    return this.connecting;
  }

  async connectRound() {
    clearTimeout(this.timers.retry);
    const generation = this.generation;
    const channels = this.channels();
    let failure = REASON.UNREACHABLE;

    for (const [index, channel] of channels.entries()) {
      try {
        const client = await this.open(channel);
        if (generation !== this.generation) {
          client.close();
          return;
        }
        this.adopt(client);
        await this.load();
        if (generation !== this.generation) {
          return;
        }
        this.attempts = 0;
        const degraded = index > 0;
        this.setStatus({
          transport: channel.transport,
          degraded,
          reason: degraded
            ? channels[0].transport === TRANSPORT.LOCAL
              ? REASON.LOCAL_FAILED
              : REASON.CLOUD_FAILED
            : null,
        });
        this.schedulePreferredRetry(degraded);
        this.scheduleRefresh();
        return;
      } catch (err) {
        if (generation !== this.generation) {
          return;
        }
        this.dropClient();
        this.logger?.warn(`Connection through ${channel.transport} failed: ${err.message}`);
        if (err instanceof TydomAuthError) {
          // The credentials are the same on both channels: do not insist.
          failure = REASON.AUTH;
          break;
        }
      }
    }

    if (generation !== this.generation) {
      return;
    }
    this.setStatus({ transport: UNREACHABLE, degraded: false, reason: failure });
    this.scheduleRetry();
  }

  async open(channel) {
    const client = this.createClient({
      ...channel,
      mac: this.config.mac,
      password: this.config.password,
      logger: this.logger,
    });
    await client.connect();
    return client;
  }

  adopt(client) {
    this.dropClient();
    this.client = client;
    client.on('push', (message) => this.handlePush(message));
    client.on('close', () => {
      if (this.client !== client) {
        return;
      }
      this.client = null;
      this.logger?.warn('Connection to the box lost');
      if (this.running) {
        this.setStatus({ transport: UNREACHABLE, degraded: false, reason: REASON.UNREACHABLE });
        this.scheduleRetry();
      }
    });
  }

  scheduleRetry() {
    const { retryDelays } = this.timing;
    const delay = retryDelays[Math.min(this.attempts, retryDelays.length - 1)];
    this.attempts += 1;
    clearTimeout(this.timers.retry);
    this.timers.retry = setTimeout(() => this.connect(), delay);
    this.timers.retry.unref?.();
  }

  // On the fallback channel: try the preferred one again from time to time,
  // and move to it once it answers.
  schedulePreferredRetry(degraded) {
    clearTimeout(this.timers.preferred);
    this.timers.preferred = null;
    if (!degraded) {
      return;
    }
    this.timers.preferred = setTimeout(async () => {
      const generation = this.generation;
      const [preferred] = this.channels();
      try {
        const client = await this.open(preferred);
        if (generation !== this.generation) {
          client.close();
          return;
        }
        this.adopt(client);
        this.setStatus({ transport: preferred.transport, degraded: false, reason: null });
        await this.refresh().catch(() => {});
      } catch (err) {
        this.logger?.debug(`Preferred channel still unavailable: ${err.message}`);
        if (generation === this.generation && this.connected) {
          this.schedulePreferredRetry(true);
        }
      }
    }, this.timing.preferredRetryDelay);
    this.timers.preferred.unref?.();
  }

  scheduleRefresh() {
    clearInterval(this.timers.refresh);
    this.timers.refresh = setInterval(() => {
      this.refresh().catch((err) => this.logger?.warn(`Refresh failed: ${err.message}`));
    }, this.config.poll_frequency * 1000);
    this.timers.refresh.unref?.();
  }

  setStatus(status) {
    const previous = this.status;
    if (
      previous.transport === status.transport &&
      previous.degraded === status.degraded &&
      previous.reason === status.reason
    ) {
      return;
    }
    this.status = status;
    this.emit('status', status, previous);
  }

  // --- Reading ---------------------------------------------------------------

  // Read everything the box knows and rebuild the radiators.
  async load() {
    const client = this.client;
    this.info = await client.get('/info').catch(() => null);
    const configFile = await client.get('/configs/file');
    // Rooms and metadata refine the radiators; a box that does not serve them
    // still works.
    const groupsFile = await client.get('/groups/file').catch(() => null);
    const meta = await client.get('/devices/meta').catch(() => null);
    const data = await client.get('/devices/data');
    this.radiators = buildRadiators({ configFile, groupsFile, meta, data });
    this.logger?.info(`${this.radiators.size} radiator(s) found on the box`);
    this.emit('radiators');
    this.diff([...this.radiators.keys()]);
    this.emit('refreshed');
    // Ask the box to query its receivers: the fresh values come back as pushes.
    client.post('/refresh/all').catch(() => {});
  }

  /** Reload the list of radiators (a radiator was paired or renamed). */
  async reload() {
    this.requireConnection();
    await this.load();
  }

  /** Full read of the values. */
  async refresh() {
    this.requireConnection();
    const client = this.client;
    client.post('/refresh/all').catch(() => {});
    this.applyData(await client.get('/devices/data'));
    this.emit('refreshed');
  }

  handlePush(message) {
    if (typeof message.uri === 'string' && message.uri.startsWith('/devices/data')) {
      this.applyData(message.body);
    }
  }

  applyData(payload) {
    this.diff(applyData(this.radiators, payload));
  }

  // Emit 'state' for the radiators whose meaning changed (a raw value can
  // change without it: a validity flag, a counter).
  diff(keys) {
    for (const key of keys) {
      const radiator = this.radiators.get(key);
      const state = radiatorState(radiator);
      const previous = this.lastStates.get(key);
      if (previous && JSON.stringify(previous) === JSON.stringify(state)) {
        continue;
      }
      this.lastStates.set(key, state);
      const commanded =
        Date.now() - (this.commandedAt.get(key) ?? -Infinity) < this.timing.commandWindow;
      this.emit('state', { radiator, state, previous, commanded });
    }
  }

  // --- Commands --------------------------------------------------------------

  requireConnection() {
    if (!this.connected) {
      throw new BridgeError('unreachable', 'The Eco Aterno box is not connected');
    }
  }

  requireRadiator(key) {
    const radiator = this.radiators.get(key);
    if (!radiator) {
      throw new BridgeError('unknown_radiator', 'This radiator is no longer on the box');
    }
    return radiator;
  }

  async send(radiator, commands) {
    this.requireConnection();
    if (commands.length === 0) {
      throw new BridgeError('unsupported', `"${radiator.name}" does not support this command`);
    }
    this.commandedAt.set(radiator.key, Date.now());
    const url = `/devices/${radiator.deviceId}/endpoints/${radiator.endpointId}/data`;
    for (const command of commands) {
      await this.client.put(url, [command]);
    }
    this.commandedAt.set(radiator.key, Date.now());
    this.scheduleConfirm();
  }

  // The box pushes the new values by itself; read them back anyway shortly
  // after, so a missed push never leaves Gladys with a stale state.
  scheduleConfirm() {
    clearTimeout(this.timers.confirm);
    this.timers.confirm = setTimeout(() => {
      if (this.connected) {
        this.client
          .get('/devices/data')
          .then((data) => this.applyData(data))
          .catch((err) => this.logger?.debug(`Read-back failed: ${err.message}`));
      }
    }, this.timing.confirmDelay);
    this.timers.confirm.unref?.();
  }

  /** Set the target temperature of a radiator, in °C. */
  async setTemperature(key, value) {
    const radiator = this.requireRadiator(key);
    return this.send(radiator, setpointCommands(radiator, value));
  }

  /** Put a radiator in a mode (MODE.OFF / HEATING / FROST). */
  async setMode(key, mode) {
    const radiator = this.requireRadiator(key);
    return this.send(radiator, modeCommands(radiator, mode));
  }

  /** Start or stop the boost of a radiator. */
  async setBoost(key, on) {
    const radiator = this.requireRadiator(key);
    return this.send(radiator, boostCommands(radiator, on));
  }

  /**
   * Run a command on several radiators.
   * @returns {Promise<number>} how many took it; the ones that cannot (no
   *   such capability) are skipped, a connection problem throws
   */
  async forEach(keys, command) {
    let done = 0;
    for (const key of keys) {
      try {
        await command(key);
        done += 1;
      } catch (err) {
        if (!(err instanceof BridgeError) || err.code === 'unreachable') {
          throw err;
        }
      }
    }
    return done;
  }
}
