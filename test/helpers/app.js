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

export async function startApp({ config = CONFIG, box = createFakeBox(), ...options } = {}) {
  const gladys = createFakeGladys({ config });
  const integration = createApp(gladys, {
    createClient: box.createClient,
    logger: silentLogger,
    // Tests do not wait seconds for a read-back or a retry.
    confirmDelay: 5,
    retryDelays: [10],
    preferredRetryDelay: 30,
    ...options,
  });
  await gladys.connect();
  await settle();
  return { gladys, box, ...integration };
}
