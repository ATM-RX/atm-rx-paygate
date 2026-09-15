import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { l402Fetch } from './client/fetch.js';
import { CredentialVault } from './client/vault.js';
import { BudgetPolicyEngine } from './client/policy.js';
import { MockClientDriver } from './client/drivers/mock.js';
import { InteractiveClientDriver } from './client/drivers/interactive.js';
import { LNbitsClientDriver } from './client/drivers/lnbits.js';
import { ClientSettlementDriver } from './types.js';
import { serve } from '@hono/node-server';
import { createServerApp } from './server/app.js';
import { ServerStore } from './server/store.js';
import { MockServerDriver } from './server/drivers/mock.js';
import { LNbitsServerDriver } from './server/drivers/lnbits.js';

dotenv.config();

const program = new Command();

program
  .name('l402')
  .description('Autonomous sovereign L402 micro-payment client & developer CLI')
  .version('1.0.0');

function getDriver(driverName?: string): ClientSettlementDriver {
  const mode = (driverName || process.env.CLIENT_DRIVER || 'mock').toLowerCase();
  switch (mode) {
    case 'interactive':
      return new InteractiveClientDriver();
    case 'lnbits':
      if (!process.env.LNBITS_API_URL || !process.env.LNBITS_ADMIN_KEY) {
        console.warn('⚠️  LNbits environment variables missing. Falling back to Mock driver.');
        return new MockClientDriver();
      }
      return new LNbitsClientDriver({
        baseUrl: process.env.LNBITS_API_URL,
        adminKey: process.env.LNBITS_ADMIN_KEY
      });
    case 'mock':
    default:
      return new MockClientDriver();
  }
}

// Command: GET
program
  .command('get <url>')
  .description('Execute an HTTP GET request with automated L402 negotiation')
  .option('-d, --driver <driver>', 'Settlement driver: mock | interactive | lnbits', 'mock')
  .option('-m, --max-fee <sats>', 'Maximum satoshis allowed for single request', '50')
  .option('-v, --verbose', 'Print verbose L402 protocol logs', false)
  .action(async (url: string, options: any) => {
    try {
      const driver = getDriver(options.driver);
      const policy = new BudgetPolicyEngine({
        maxSatsPerRequest: parseInt(options.maxFee, 10)
      });
      const vault = new CredentialVault();

      if (options.verbose) {
        console.log(`⚡ Dispatching GET to ${url}`);
        console.log(`⚡ Settlement Driver: ${driver.name.toUpperCase()}`);
        console.log(`⚡ Max Fee Limit: ${options.maxFee} sats`);
      }

      const result = await l402Fetch(url, {
        method: 'GET',
        driver,
        policy,
        vault,
        verbose: options.verbose
      });

      if (result.settled) {
        console.error(`\n[L402] Settled ${result.amountSats} sats. Preimage verified.`);
      }

      console.log(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
    } catch (err: any) {
      console.error(`\n❌ Request failed: ${err.message}`);
      process.exit(1);
    }
  });

// Command: POST
program
  .command('post <url>')
  .description('Execute an HTTP POST request with automated L402 negotiation')
  .option('-b, --body <data>', 'Request JSON body string', '{}')
  .option('-d, --driver <driver>', 'Settlement driver: mock | interactive | lnbits', 'mock')
  .option('-m, --max-fee <sats>', 'Maximum satoshis allowed for single request', '50')
  .option('-v, --verbose', 'Print verbose L402 protocol logs', false)
  .action(async (url: string, options: any) => {
    try {
      let body: any = {};
      try {
        body = JSON.parse(options.body);
      } catch {
        body = options.body;
      }

      const driver = getDriver(options.driver);
      const policy = new BudgetPolicyEngine({
        maxSatsPerRequest: parseInt(options.maxFee, 10)
      });
      const vault = new CredentialVault();

      if (options.verbose) {
        console.log(`⚡ Dispatching POST to ${url}`);
        console.log(`⚡ Settlement Driver: ${driver.name.toUpperCase()}`);
      }

      const result = await l402Fetch(url, {
        method: 'POST',
        body,
        driver,
        policy,
        vault,
        verbose: options.verbose
      });

      if (result.settled) {
        console.error(`\n[L402] Settled ${result.amountSats} sats. Preimage verified.`);
      }

      console.log(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
    } catch (err: any) {
      console.error(`\n❌ Request failed: ${err.message}`);
      process.exit(1);
    }
  });

// Command: VAULT
const vaultCmd = program.command('vault').description('Inspect and manage local L402 credentials');

vaultCmd
  .command('list')
  .description('List all unexpired cached Macaroons and preimages in local vault')
  .action(() => {
    const vault = new CredentialVault();
    const list = vault.list();
    console.log(`\n📦 L402 Credential Vault (~/.l402/vault.json)`);
    console.log(`Active unexpired tokens: ${list.length}\n`);

    if (list.length === 0) {
      console.log('No tokens stored.');
      return;
    }

    list.forEach((t, i) => {
      const remainingSecs = Math.max(0, t.expiresAt - Math.floor(Date.now() / 1000));
      console.log(`[${i + 1}] ${t.method} ${t.urlPattern}`);
      console.log(`    Expires in: ${remainingSecs}s | Paid: ${t.amountSats} sats`);
      console.log(`    Preimage:   ${t.preimage.slice(0, 16)}...`);
      console.log(`    Macaroon:   ${t.macaroon.slice(0, 24)}...`);
    });
  });

vaultCmd
  .command('clear')
  .description('Clear all cached credentials from local vault')
  .action(() => {
    const vault = new CredentialVault();
    vault.clear();
    console.log('🧹 Local credential vault wiped.');
  });

vaultCmd
  .command('status')
  .description('Check daily budget and spending status')
  .action(() => {
    const policy = new BudgetPolicyEngine();
    const status = policy.getDailyStatus();
    console.log(`\n🛡️  L402 Budget Policy Status:`);
    console.log(`    Date:            ${status.date}`);
    console.log(`    Spent Today:     ${status.spentSats} sats`);
    console.log(`    Remaining Limit: ${status.remainingSats} sats`);
    console.log(`    Daily Ceiling:   ${status.dailyLimit} sats\n`);
  });

// Command: SERVE (Local Gateway / Test Harness)
program
  .command('serve')
  .description('Run the sovereign L402 payment gateway server / test harness')
  .option('-p, --port <port>', 'Server port', '4020')
  .option('-d, --driver <driver>', 'Server settlement driver: mock | lnbits', 'mock')
  .action((options: any) => {
    const port = parseInt(options.port, 10);
    const rootKey = process.env.L402_ROOT_KEY || 'sovereign_dev_root_key_atm_rx_2026';

    let serverDriver;
    if (options.driver === 'lnbits' && process.env.LNBITS_API_URL && process.env.LNBITS_API_KEY) {
      serverDriver = new LNbitsServerDriver({
        baseUrl: process.env.LNBITS_API_URL,
        apiKey: process.env.LNBITS_API_KEY
      });
    } else {
      serverDriver = new MockServerDriver();
    }

    const store = new ServerStore();
    const app = createServerApp({ rootKey, driver: serverDriver, store });

    console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`║                   ATM-RX L402 SOVEREIGN GATEWAY                  ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════╝`);
    console.log(`⚡ Settlement Driver: ${serverDriver.name.toUpperCase()}`);
    console.log(`⚡ Listening on:      http://localhost:${port}`);
    console.log(`⚡ Protected Routes:  POST /api/v1/sast-scan (10 sats)`);
    console.log(`                      GET  /api/v1/sovereign-dossier (25 sats)\n`);

    serve({
      fetch: app.fetch,
      port
    });
  });

program.parse(process.argv);
