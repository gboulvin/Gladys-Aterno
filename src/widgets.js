// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
// Two widgets, declared in the manifest `widgets` field:
//   - `aterno_overview`: the whole installation at a glance (how many
//     radiators heat, average temperature, connection, open windows, faults)
//     with buttons acting on every radiator;
//   - `aterno_radiator`: one radiator, chosen in the widget settings — live
//     temperatures, mode, and the quick actions of the Eco Aterno app.
//
// The content is declarative: the Gladys core renders it with its own theme
// and picks the language in the `{ en, fr, de, es }` objects. Temperatures
// are bound to the device features (`device_feature`): they follow the
// published states live, with no refresh involved.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { UNREACHABLE } from './bridge.js';
import { FEATURE } from './devices.js';
import { t } from './i18n.js';
import { MODE, capabilities, clampSetpoint, radiatorState, setpointRange } from './radiators.js';

export const OVERVIEW_WIDGET = 'aterno_overview';
export const RADIATOR_WIDGET = 'aterno_radiator';

// Button actions. The core keeps one button per action key in a content, so
// every button has its own; what it does is in the tables below, never in
// what comes back from the dashboard.
const ACTION = {
  ALL_HEATING: 'all_heating',
  ALL_FROST: 'all_frost',
  ALL_OFF: 'all_off',
  REFRESH: 'refresh',
  WARMER: 'warmer',
  COOLER: 'cooler',
  TURN_ON: 'turn_on',
  TURN_OFF: 'turn_off',
  FROST: 'frost',
  BOOST_START: 'boost_start',
  BOOST_STOP: 'boost_stop',
};

const ALL_MODE_ACTIONS = {
  [ACTION.ALL_HEATING]: MODE.HEATING,
  [ACTION.ALL_FROST]: MODE.FROST,
  [ACTION.ALL_OFF]: MODE.OFF,
};

const MODE_ACTIONS = {
  [ACTION.TURN_ON]: MODE.HEATING,
  [ACTION.TURN_OFF]: MODE.OFF,
  [ACTION.FROST]: MODE.FROST,
};

const MODE_COLORS = {
  [MODE.HEATING]: WIDGET_COLORS.SUCCESS,
  [MODE.FROST]: WIDGET_COLORS.INFO,
  [MODE.OFF]: WIDGET_COLORS.NEUTRAL,
};

const TRANSPORT_COLORS = {
  local: WIDGET_COLORS.SUCCESS,
  cloud: WIDGET_COLORS.INFO,
  [UNREACHABLE]: WIDGET_COLORS.DANGER,
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function connectionItem(app) {
  const { transport, degraded } = app.bridge.status;
  const label = t(`transport.${transport}`);
  return {
    label: t('widget.connection'),
    icon: 'wifi',
    value: degraded ? t('transport.degraded', { transport: label }) : label,
    color: degraded ? WIDGET_COLORS.WARNING : TRANSPORT_COLORS[transport],
  };
}

const notConnected = (app) => ({
  ttl_seconds: 60,
  components: [
    { type: 'text', variant: 'body', text: t('widget.not_connected') },
    { type: 'status', items: [connectionItem(app)] },
  ],
});

function modeItem(mode) {
  return {
    label: t('widget.mode'),
    icon: 'thermometer',
    value: t(`mode.${mode ?? 'unknown'}`),
    color: MODE_COLORS[mode] ?? WIDGET_COLORS.NEUTRAL,
  };
}

export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    async get(app) {
      const radiators = [...app.bridge.radiators.values()];
      if (radiators.length === 0) {
        return notConnected(app);
      }
      const states = radiators.map(radiatorState);
      const heating = states.filter((state) => state.mode === MODE.HEATING).length;
      const temperatures = states.map((s) => s.temperature).filter((value) => value !== null);
      const openWindows = states.filter((state) => state.windowOpen === true).length;
      const faults = states.filter((state) => state.faults.length > 0).length;
      const product = app.bridge.info?.productName;

      const components = [
        {
          type: 'value',
          label: t('widget.heating'),
          icon: 'thermometer',
          value: `${heating}/${radiators.length}`,
          color: heating > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
        },
      ];
      if (temperatures.length > 0) {
        const average = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;
        components.push({
          type: 'value',
          label: t('widget.average'),
          icon: 'home',
          value: Math.round(average * 10) / 10,
          unit: '°C',
        });
      }
      components.push({
        type: 'status',
        items: [
          connectionItem(app),
          ...(product
            ? [{ label: t('widget.box'), icon: 'box', value: truncate(String(product), 40) }]
            : []),
          {
            label: t('widget.windows_open'),
            icon: 'wind',
            value: openWindows,
            color: openWindows > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: t('widget.faults'),
            icon: 'alert-triangle',
            value: faults,
            color: faults > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
          },
        ],
      });
      components.push(
        {
          type: 'button',
          label: t('widget.all_heating'),
          icon: 'sun',
          style: 'primary',
          action: { key: ACTION.ALL_HEATING },
        },
        {
          type: 'button',
          label: t('widget.all_frost'),
          icon: 'cloud-snow',
          style: 'secondary',
          action: { key: ACTION.ALL_FROST },
        },
        {
          type: 'button',
          label: t('widget.all_off'),
          icon: 'power',
          style: 'danger',
          action: { key: ACTION.ALL_OFF, confirm: true },
        },
        {
          type: 'button',
          label: t('widget.refresh'),
          icon: 'refresh-cw',
          style: 'secondary',
          action: { key: ACTION.REFRESH },
        },
      );
      // The computed rows change with the radiators: the integration nudges
      // the widget when they do (see refreshWidgets), the TTL is a safety net.
      return { ttl_seconds: 120, components };
    },

    async action(app, { actionKey }) {
      if (actionKey === ACTION.REFRESH) {
        await app.bridge.refresh();
        return t('toast.refreshed');
      }
      const mode = ALL_MODE_ACTIONS[actionKey];
      if (mode) {
        const count = await app.bridge.forEach([...app.bridge.radiators.keys()], (key) =>
          app.bridge.setMode(key, mode),
        );
        return t('toast.mode', { count, mode: t(`mode.${mode}`) });
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },

  [RADIATOR_WIDGET]: {
    async get(app, { settings }) {
      const radiator = settings?.device ? app.radiatorByDevice(settings.device) : null;
      if (!radiator) {
        return app.bridge.radiators.size === 0
          ? notConnected(app)
          : {
              ttl_seconds: 300,
              components: [{ type: 'text', variant: 'body', text: t('widget.pick_radiator') }],
            };
      }
      const caps = capabilities(radiator);
      const state = radiatorState(radiator);
      const device = app.deviceExternalId(radiator);
      const components = [
        { type: 'text', variant: 'heading', text: truncate(app.deviceName(radiator), 40) },
      ];

      if (caps.temperature) {
        components.push({
          type: 'value',
          label: t('feature.temperature'),
          icon: 'thermometer',
          device_feature: app.featureExternalId(radiator, FEATURE.TEMPERATURE),
        });
      }
      if (caps.setpoint) {
        components.push({
          type: 'value',
          label: t('feature.target'),
          icon: 'target',
          device_feature: app.featureExternalId(radiator, FEATURE.TARGET),
        });
      }

      const items = [modeItem(state.mode)];
      if (radiator.room) {
        items.push({ label: t('widget.room'), icon: 'home', value: truncate(radiator.room, 40) });
      }
      if (state.windowOpen !== null) {
        items.push({
          label: t('feature.window'),
          icon: 'wind',
          value: t(state.windowOpen ? 'open' : 'closed'),
          color: state.windowOpen ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
        });
      }
      if (state.presence !== null) {
        items.push({
          label: t('feature.presence'),
          icon: 'user',
          value: t(state.presence ? 'yes' : 'no'),
          color: state.presence ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
        });
      }
      if (state.boost !== null) {
        items.push({
          label: t('feature.boost'),
          icon: 'zap',
          value: t(state.boost ? 'on' : 'off'),
          color: state.boost ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
        });
      }
      for (const fault of state.faults) {
        items.push({
          label: t(`fault.${fault}`),
          icon: 'alert-triangle',
          value: '!',
          color: WIDGET_COLORS.DANGER,
        });
      }
      components.push({ type: 'status', items });

      // `params` are declared here and sent back as they are (a dashboard can
      // hang on a wall, the handler never receives free input): they only say
      // WHICH radiator the button is about.
      const params = { device };
      if (caps.setpoint) {
        components.push(
          {
            type: 'button',
            label: t('widget.cooler'),
            icon: 'minus',
            style: 'secondary',
            action: { key: ACTION.COOLER, params },
          },
          {
            type: 'button',
            label: t('widget.warmer'),
            icon: 'plus',
            style: 'secondary',
            action: { key: ACTION.WARMER, params },
          },
        );
      }
      if (caps.mode) {
        const off = state.mode === MODE.OFF;
        components.push({
          type: 'button',
          label: t(off ? 'widget.turn_on' : 'widget.turn_off'),
          icon: 'power',
          style: off ? 'primary' : 'danger',
          action: { key: off ? ACTION.TURN_ON : ACTION.TURN_OFF, params },
        });
      }
      if (caps.boost) {
        components.push({
          type: 'button',
          label: t(state.boost ? 'widget.boost_stop' : 'widget.boost_start'),
          icon: 'zap',
          style: 'secondary',
          action: { key: state.boost ? ACTION.BOOST_STOP : ACTION.BOOST_START, params },
        });
      } else if (caps.frost && state.mode !== MODE.FROST) {
        // In frost protection, "Turn off" / "Turn on" above already lead out.
        components.push({
          type: 'button',
          label: t('widget.frost'),
          icon: 'cloud-snow',
          style: 'secondary',
          action: { key: ACTION.FROST, params },
        });
      }
      return { ttl_seconds: 120, components };
    },

    async action(app, { actionKey, params }) {
      const radiator = params?.device ? app.radiatorByDevice(params.device) : null;
      if (!radiator) {
        throw new Error('This radiator is no longer on the box');
      }
      if (actionKey === ACTION.WARMER || actionKey === ACTION.COOLER) {
        const { min, step } = setpointRange(radiator);
        const current = radiatorState(radiator).setpoint ?? min;
        const value = clampSetpoint(
          radiator,
          current + (actionKey === ACTION.WARMER ? step : -step),
        );
        await app.bridge.setTemperature(radiator.key, value);
        return t('toast.temperature', { value });
      }
      const mode = MODE_ACTIONS[actionKey];
      if (mode) {
        await app.bridge.setMode(radiator.key, mode);
        return t('toast.mode', { count: 1, mode: t(`mode.${mode}`) });
      }
      if (actionKey === ACTION.BOOST_START || actionKey === ACTION.BOOST_STOP) {
        const on = actionKey === ACTION.BOOST_START;
        await app.bridge.setBoost(radiator.key, on);
        return t(on ? 'toast.boost_on' : 'toast.boost_off');
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};

/**
 * Ask the core to re-pull every widget now instead of waiting for the content
 * TTL. Fire-and-forget, rate-limited core-side to 1 per 10 s per widget.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
