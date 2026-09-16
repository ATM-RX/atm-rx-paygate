import { Buffer } from 'node:buffer';

// Ensure Buffer and process exist on globalThis in Workers isolate
if (typeof (globalThis as any).Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}
if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env: {},
    uptime: () => 0,
    memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
    platform: 'linux'
  };
}

import { createServerApp } from './server/app.js';
import { ServerStore } from './server/store.js';
import { MockServerDriver } from './server/drivers/mock.js';
import { LNbitsServerDriver } from './server/drivers/lnbits.js';
import { ServerSettlementDriver } from './types.js';

export interface Env {
  L402_ROOT_KEY?: string;
  SETTLEMENT_DRIVER?: string;
  LNBITS_API_URL?: string;
  LNBITS_API_KEY?: string;
}

// Global in-memory store for edge worker instance
const edgeStore = new ServerStore();

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const rootKey = env.L402_ROOT_KEY || 'sovereign_edge_root_key_atm_rx_2026';
    const driverMode = env.SETTLEMENT_DRIVER || 'mock';

    let driver: ServerSettlementDriver;
    if (driverMode === 'lnbits' && env.LNBITS_API_URL && env.LNBITS_API_KEY) {
      driver = new LNbitsServerDriver({
        baseUrl: env.LNBITS_API_URL,
        apiKey: env.LNBITS_API_KEY
      });
    } else {
      driver = new MockServerDriver();
    }

    const app = createServerApp({
      rootKey,
      driver,
      store: edgeStore
    });

    return app.fetch(request, env, ctx);
  }
};
