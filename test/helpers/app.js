// -----------------------------------------------------------------------------
// Start the integration against the fake Gladys of the SDK and a simulated
// box (fakeBox.js): what index.js does, without any network.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { MAC, PASSWORD, createFakeBox } from './fakeBox.js';

export const silentLogger = createLogger({ level: 'silent' });

// A complete configuration: local address known, local preferred.
export const CONFIG = { mac: MAC, password: PASSWORD, host: '192.168.1.50' };

/** Let the fire-and-forget publications of the integration reach Gladys. */
export const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// What the core answers to an mDNS scan on a network where the box announces
// itself (the shape of `gladys.scanNetwork('mdns')` results).
export function mdnsAnswers(address = '192.168.1.50', name = 'TYDOM-ABCDEF') {
  return [
    { name: 'Living room TV', host: 'tv.local', addresses: ['192.168.1.20'], port: 8008, txt: [] },
    { name, host: `${name.toLowerCase()}.local`, addresses: [address], port: 443, txt: [] },
  ];
}

export async function startApp({
  config = CONFIG,
  box = createFakeBox(),
  mdns = [],
  ...options
} = {}) {
  const gladys = createFakeGladys({ config, scanResults: { mdns } });
  const integration = createApp(gladys, {
    createClient: box.createClient,
    logger: silentLogger,
    // Tests do not wait seconds for a read-back or a retry.
    confirmDelay: 5,
    retryDelays: [10],
    preferredRetryDelay: 30,
    discoveryInterval: 0,
    ...options,
  });
  await gladys.connect();
  await settle();
  return { gladys, box, ...integration };
}
