import { serve } from '@hono/node-server';
import * as dotenv from 'dotenv';
import { createServerApp } from './app.js';
import { ServerStore } from './store.js';
import { MockServerDriver } from './drivers/mock.js';
import { LNbitsServerDriver } from './drivers/lnbits.js';
import { ServerSettlementDriver } from '../types.js';

dotenv.config();

const port = parseInt(process.env.PORT || '4020', 10);
const rootKey = process.env.L402_ROOT_KEY || 'sovereign_dev_root_key_atm_rx_2026';
const driverMode = process.env.SETTLEMENT_DRIVER || 'mock';

let driver: ServerSettlementDriver;
if (driverMode === 'lnbits' && process.env.LNBITS_API_URL && process.env.LNBITS_API_KEY) {
  driver = new LNbitsServerDriver({
    baseUrl: process.env.LNBITS_API_URL,
    apiKey: process.env.LNBITS_API_KEY
  });
} else {
  driver = new MockServerDriver();
}

const store = new ServerStore();
const app = createServerApp({ rootKey, driver, store });

console.log(`[atm-rx-paygate] Starting L402 Sovereign Gateway...`);
console.log(`[atm-rx-paygate] Settlement Driver: ${driver.name.toUpperCase()}`);
console.log(`[atm-rx-paygate] Listening on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port
});
