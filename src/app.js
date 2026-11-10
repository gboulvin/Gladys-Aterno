// -----------------------------------------------------------------------------
// The integration: Gladys on one side, the Eco Aterno box on the other.
//
// `createApp(gladys)` registers every SDK handler and wires the bridge events
// to the Gladys host API. It takes the Gladys client as a parameter so the
// tests can pass the fake Gladys of the SDK, and a client factory so they can
// pass a simulated box. index.js calls it with the real ones.
// -----------------------------------------------------------------------------

import { createLogger, logger as defaultLogger } from '@gladysassistant/integration-sdk';
import { AternoBridge, REASON, UNREACHABLE } from './bridge.js';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, sameConnection } from './config.js';
import {
  FEATURE,
  buildDevice,
  buildStates,
  deviceName,
  radiatorIds,
  setFeatureValue,
} from './devices.js';
import { t } from './i18n.js';
import { radiatorState } from './radiators.js';
import { SCENE_ACTIONS, fireConnectionTrigger, fireRadiatorTriggers } from './scenes.js';
import { TydomClient } from './tydom/client.js';
import { WIDGETS, refreshWidgets } from './widgets.js';

// An unchanged value is sent again this often, so it stays recently dated.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;
// publishTransports accepts 100 entries per request.
const TRANSPORT_BATCH = 100;

// Keys of the manifest `actions` (buttons of the Configuration screen).
export const ACTION = { TEST_CONNECTION: 'test_connection', REFRESH_DEVICES: 'refresh_devices' };

export function createApp(
  gladys,
  { createClient = (options) => new TydomClient(options), logger = defaultLogger, ...timing } = {},
) {
  const bridge = new AternoBridge({
    createClient,
    logger: logger === defaultLogger ? createLogger({ name: 'box' }) : logger,
    ...timing,
  });

  // What the handlers share. `config` is hot-reloaded (onConfigUpdated).
  const app = {
    gladys,
    bridge,
    config: normalizeConfig(DEFAULT_CONFIG),
    deviceName,
    deviceExternalId: (radiator) => radiatorIds(gladys, app.config, radiator).device,
    featureExternalId: (radiator, key) => radiatorIds(gladys, app.config, radiator).feature(key),
    radiatorByDevice(externalId) {
      for (const radiator of bridge.radiators.values()) {
        if (app.deviceExternalId(radiator) === externalId) {
          return radiator;
        }
      }
      return null;
    },
  };

  // A Gladys that is restarting or briefly unreachable must not take the box
  // connection down with it: host API failures are logged, never thrown into
  // the bridge.
  const safely = (label, task) =>
    Promise.resolve()
      .then(task)
      .catch((err) => logger.warn(`${label} failed: ${err.message}`));

  // --- Box -> Gladys ---------------------------------------------------------

  const buildDevices = () =>
    [...bridge.radiators.values()].map((radiator) => buildDevice(gladys, app.config, radiator));

  async function publishDevices() {
    // An empty list would wipe the Discovery tab while the box is merely down.
    if (bridge.radiators.size > 0) {
      await gladys.publishDiscoveredDevices(buildDevices());
    }
  }

  async function publishStates(radiators) {
    const states = radiators.flatMap((radiator) =>
      buildStates(gladys, app.config, radiator, radiatorState(radiator)),
    );
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  }

  // The transport badge of every radiator: they all share the channel of the
  // box. A fallback is flagged degraded, with the reason in the tooltip.
  async function publishTransports() {
    const { transport, degraded, reason } = bridge.status;
    const entries = [...bridge.radiators.values()].map((radiator) => ({
      external_id: app.deviceExternalId(radiator),
      transport,
      ...(degraded ? { degraded: true, message: t(`status.${reason}`) } : {}),
    }));
    for (let i = 0; i < entries.length; i += TRANSPORT_BATCH) {
      await gladys.publishTransports(entries.slice(i, i + TRANSPORT_BATCH));
    }
  }

  // Application-level status, shown in the Configuration screen: RUNNING and
  // connected to Gladys does not mean connected to the box.
  async function publishConnectionStatus() {
    const { transport, reason } = bridge.status;
    if (transport === UNREACHABLE) {
      await gladys.setConnectionStatus(false, t(`status.${reason ?? REASON.UNREACHABLE}`));
    } else {
      await gladys.setConnectionStatus(true, reason ? t(`status.${reason}`) : undefined);
    }
  }

  // Everything Gladys shows, from what the bridge currently knows.
  async function publishAll() {
    await safely('Publishing the devices', publishDevices);
    await safely('Publishing the states', () => publishStates([...bridge.radiators.values()]));
    await safely('Publishing the transports', publishTransports);
    await safely('Publishing the connection status', publishConnectionStatus);
    refreshWidgets(gladys);
  }

  bridge.on('radiators', () => {
    safely('Publishing the devices', publishDevices);
  });

  bridge.on('state', (change) => {
    safely('Publishing a state', () => publishStates([change.radiator]));
    safely('Firing a scene trigger', () => fireRadiatorTriggers(app, change));
    refreshWidgets(gladys);
  });

  bridge.on('refreshed', () => {
    // Nothing changed is still worth a heartbeat (see STATE_HEARTBEAT_MS).
    safely('Publishing the states', () => publishStates([...bridge.radiators.values()]));
  });

  bridge.on('status', (status, previous) => {
    logger.info(`Box connection: ${status.transport}${status.reason ? ` (${status.reason})` : ''}`);
    safely('Publishing the connection status', publishConnectionStatus);
    safely('Publishing the transports', publishTransports);
    // The very first status only says the integration started: not an event.
    if (previous.reason !== REASON.NOT_CONFIGURED) {
      safely('Firing a scene trigger', () => fireConnectionTrigger(app, status, previous));
    }
    refreshWidgets(gladys);
  });

  // --- Gladys -> box ---------------------------------------------------------

  async function applyConfig(raw) {
    const config = normalizeConfig(raw);
    const restart = !bridge.running || !sameConnection(config, app.config);
    app.config = config;
    if (restart) {
      await bridge.start(config);
    } else {
      // Refresh interval or language: nothing to reconnect for.
      bridge.config = config;
      if (bridge.connected) {
        bridge.scheduleRefresh();
      }
    }
    await publishAll();
  }

  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the radiators');
    if (bridge.connected) {
      await bridge.reload();
    }
    await gladys.publishDiscoveredDevices(buildDevices());
  });

  gladys.onSetValue(async (device, feature, value) => {
    logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
    const radiator = app.radiatorByDevice(device.external_id);
    if (!radiator) {
      // Throwing acks the command as failed, with this message.
      throw new Error(`No radiator behind ${device.external_id}`);
    }
    const featureKey = Object.values(FEATURE).find(
      (key) => app.featureExternalId(radiator, key) === feature.external_id,
    );
    // The state is published once the box confirms it (push or read-back),
    // not here: Gladys shows what the radiator does, not what was asked.
    await setFeatureValue(bridge, radiator, featureKey, value);
  });

  gladys.onAction(ACTION.TEST_CONNECTION, async () => {
    if (!isConfigured(app.config)) {
      return t('status.not_configured');
    }
    if (!bridge.connected) {
      // Do not wait for the next scheduled attempt: try now.
      await bridge.start(app.config);
    }
    const { transport, reason } = bridge.status;
    if (transport === UNREACHABLE) {
      return t(`status.${reason ?? REASON.UNREACHABLE}`);
    }
    return t('action.test.ok', {
      transport: t(`transport.${transport}`),
      product: bridge.info?.productName ?? 'Eco Aterno',
      count: bridge.radiators.size,
    });
  });

  gladys.onAction(ACTION.REFRESH_DEVICES, async () => {
    if (!bridge.connected) {
      return t(`status.${bridge.status.reason ?? REASON.UNREACHABLE}`);
    }
    await bridge.reload();
    await gladys.publishDiscoveredDevices(buildDevices());
    return t('action.refresh.ok', { count: bridge.radiators.size });
  });

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => {
      logger.info(`Scene action ${key}`);
      return handler(app, fields ?? {});
    });
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(app, request ?? {}));
    gladys.onWidgetAction(key, (actionKey, params, context) => {
      logger.info(`Widget action ${key}.${actionKey}`);
      return widget.action(app, { actionKey, params, settings: context?.settings });
    });
  }

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    await applyConfig(newConfig);
  });

  // (Re)connected to Gladys: read the config, make sure the box connection
  // runs, and publish everything again — Gladys may have missed it all.
  gladys.on('connected', async () => {
    try {
      await applyConfig(await gladys.getConfig());
    } catch (err) {
      logger.error('Initialization failed', err);
      await safely('Publishing the connection status', () =>
        gladys.setConnectionStatus(false, t('status.unreachable')),
      );
    }
  });

  return {
    app,
    bridge,
    /** Close the box connection (graceful shutdown). */
    stop: () => bridge.stop(),
  };
}
