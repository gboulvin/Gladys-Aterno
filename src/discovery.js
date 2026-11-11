// -----------------------------------------------------------------------------
// Finding the Eco Aterno box on the local network, by mDNS.
//
// The Tydom library inside the Eco Aterno app finds the box on the LAN with
// mDNS (JmDNS, `_http._tcp` / `_https._tcp`, names starting with `TYDOM-`).
// The integration container sits on a bridge network that mDNS never
// crosses, so the scan goes through the Gladys core (`gladys.scanNetwork`,
// "mediated network discovery"): the core browses the service types the
// manifest declares in `network_discovery`, the integration picks the boxes
// out of the answers.
//
// Not verified on a physical box yet: the exact name and service type the box
// announces come from what the app looks for. The filter is kept broad on
// purpose — the bridge only keeps an address once the box there accepted the
// MAC address and the password, so a wrong candidate costs one failed attempt,
// never a wrong box.
// -----------------------------------------------------------------------------

// Service types browsed, as declared in the manifest `network_discovery`
// (test/manifest.test.js checks both sides).
export const MDNS_SERVICES = ['_https._tcp', '_http._tcp'];

const SCAN_TIMEOUT_SECONDS = 5;
// The core accepts one scan per 10 s; a box that is down must not make every
// reconnection attempt scan the network.
const DEFAULT_MIN_INTERVAL_MS = 60_000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const isIpv4 = (address) =>
  typeof address === 'string' &&
  IPV4.test(address) &&
  address.split('.').every((part) => Number(part) <= 255);

/**
 * The addresses of the boxes among raw mDNS answers, most likely first: a
 * name carrying the end of the MAC address of the box comes before any other
 * Tydom box.
 * @param {Array<{ name?: string, host?: string, addresses?: string[] }>} services
 * @param {string} mac MAC address of the box, normalized (12 hex digits)
 * @returns {string[]} IPv4 addresses, without duplicates
 */
export function pickBoxAddresses(services, mac) {
  const suffix = mac.slice(-6).toLowerCase();
  const matches = [];
  for (const service of Array.isArray(services) ? services : []) {
    const label = `${service?.name ?? ''} ${service?.host ?? ''}`.toLowerCase();
    if (!label.includes('tydom')) {
      continue;
    }
    const addresses = (Array.isArray(service.addresses) ? service.addresses : []).filter(isIpv4);
    if (addresses.length > 0) {
      matches.push({ addresses, mine: suffix.length === 6 && label.includes(suffix) });
    }
  }
  matches.sort((a, b) => Number(b.mine) - Number(a.mine));
  return [...new Set(matches.flatMap((match) => match.addresses))];
}

/**
 * Build the `discover(config)` function the bridge calls when it needs the
 * address of the box. It never throws: a Gladys that refuses or fails the
 * scan simply finds nothing, and the bridge goes through the cloud.
 */
export function createDiscovery(gladys, { logger, minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = {}) {
  let lastScanAt = -Infinity;
  let lastServices = [];

  return async function discover(config) {
    const now = Date.now();
    if (now - lastScanAt >= minIntervalMs) {
      lastScanAt = now;
      try {
        lastServices = await gladys.scanNetwork('mdns', { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
      } catch (err) {
        logger?.warn(`Looking for the box on the local network failed: ${err.message}`);
        lastServices = [];
      }
    }
    const addresses = pickBoxAddresses(lastServices, config.mac);
    logger?.debug(`Local discovery: ${addresses.length ? addresses.join(', ') : 'no box found'}`);
    return addresses;
  };
}
