// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` declared in
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes what Gladys sends, so the rest of the code never deals with
// `undefined`, a MAC address typed with separators or a pasted URL.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  mac: '',
  password: '',
  // IP address or hostname of the box on the local network; empty = cloud only.
  host: '',
  // Cloud relay of the box. The box itself reports this host.
  mediation_host: 'mediation.tydom.com',
  // Language of the device and feature names created in Gladys.
  language: 'fr',
  // Seconds between two full refreshes. The box also pushes every change as
  // it happens: this is the safety net, not the main path.
  poll_frequency: 300,
  // Reserved key (NOT in config_schema): the manifest declares both `local`
  // and `cloud` transports, so Gladys shows its standard "Prefer the local
  // connection" toggle and sends the choice here. Read-only, default true.
  GLADYS_PREFER_LOCAL: true,
};

export const MIN_POLL_FREQUENCY = 60;
export const MAX_POLL_FREQUENCY = 3600;

/** `00:1a:25-12.34 56` -> `001A25123456`; '' when it is not a MAC address. */
export function normalizeMac(value) {
  const mac = String(value ?? '')
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase();
  return mac.length === 12 ? mac : '';
}

/** `https://192.168.1.20:443/` -> `192.168.1.20`; '' when unusable. */
export function normalizeHost(value) {
  const host = String(value ?? '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '');
  return /^[a-z0-9.-]+$/i.test(host) ? host.toLowerCase() : '';
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    mac: normalizeMac(raw.mac),
    password: typeof raw.password === 'string' ? raw.password : '',
    host: normalizeHost(raw.host),
    mediation_host: normalizeHost(raw.mediation_host) || DEFAULT_CONFIG.mediation_host,
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(MAX_POLL_FREQUENCY, Math.max(MIN_POLL_FREQUENCY, Math.round(pollFrequency)))
      : DEFAULT_CONFIG.poll_frequency,
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

/** The box cannot be reached without its MAC address and its password. */
export function isConfigured(config) {
  return config.mac !== '' && config.password !== '';
}

/** Do two configs lead to the same connection? (anything else is cosmetic) */
export function sameConnection(a, b) {
  return ['mac', 'password', 'host', 'mediation_host', 'GLADYS_PREFER_LOCAL'].every(
    (key) => a[key] === b[key],
  );
}
