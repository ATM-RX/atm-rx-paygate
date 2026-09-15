import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { serve } from '@hono/node-server';
import { createServerApp } from '../src/server/app.js';
import { ServerStore } from '../src/server/store.js';
import { MockServerDriver } from '../src/server/drivers/mock.js';
import { l402Fetch } from '../src/client/fetch.js';
import { MockClientDriver } from '../src/client/drivers/mock.js';
import { CredentialVault } from '../src/client/vault.js';
import { BudgetPolicyEngine } from '../src/client/policy.js';

export async function runE2ETests() {
  console.log('🧪 Testing Full End-to-End L402 Protocol Flow (Client + Gateway)...');

  const testPort = 4029;
  const rootKey = 'test_e2e_secret_key_atm_rx';
  const serverDriver = new MockServerDriver();
  const serverStore = new ServerStore();
  const app = createServerApp({ rootKey, driver: serverDriver, store: serverStore });

  // 1. Boot test server
  const serverInstance: any = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: testPort }, () => {
      resolve(s);
    });
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l402-e2e-vault-'));
  const testVaultFile = path.join(tempDir, 'vault.json');

  try {
    const baseUrl = `http://localhost:${testPort}`;

    // 2. Test Public Endpoint (/health)
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200, 'Public health endpoint must return 200 OK');
    const healthData: any = await healthRes.json();
    assert.strictEqual(healthData.status, 'operational');
    assert.ok(healthData.memory.rssMb > 0, 'Must report memory telemetry');

    // 3. Test Protected Endpoint via l402Fetch (Initial challenge + automated settlement)
    const vault = new CredentialVault(testVaultFile);
    const policy = new BudgetPolicyEngine({ maxSatsPerRequest: 50 });
    const clientDriver = new MockClientDriver();

    const protectedUrl = `${baseUrl}/api/v1/sast-scan`;

    const result = await l402Fetch(protectedUrl, {
      method: 'POST',
      body: { target: 'ATM-RX/test-repo' },
      driver: clientDriver,
      vault,
      policy
    });

    assert.strictEqual(result.status, 200, 'Protected endpoint must return 200 OK after settlement');
    assert.strictEqual(result.settled, true, 'Result must indicate invoice was settled');
    assert.strictEqual(result.amountSats, 10, 'Must record 10 sats settled');
    assert.ok(result.data.success, 'Response must contain SAST analysis report');
    assert.strictEqual(result.data.target, 'ATM-RX/test-repo');
    assert.ok(result.data.report.findings.length > 0, 'Must return security findings');

    // 4. Verify token was cached in vault
    const cached = vault.getValidToken(protectedUrl, 'POST');
    assert.ok(cached !== null, 'Settled token must be saved in client vault');

    console.log('  ✅ End-to-End client-server protocol flow passed.');
  } finally {
    // 5. Clean teardown
    if (serverInstance && typeof serverInstance.close === 'function') {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
