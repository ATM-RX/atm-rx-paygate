import { runCryptoTests } from './crypto.test.js';
import { runPolicyTests } from './policy.test.js';
import { runVaultTests } from './vault.test.js';
import { runReplayTests } from './replay.test.js';
import { runE2ETests } from './e2e.test.js';

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║          ATM-RX L402 PROTOCOL SUITE: TEST RUNNER                ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  const suites = [
    { name: 'Crypto & Macaroon Engine', fn: runCryptoTests },
    { name: 'Client Budget Policy & Decoder', fn: runPolicyTests },
    { name: 'Local Credential Vault', fn: runVaultTests },
    { name: 'Atomic Anti-Replay Store', fn: runReplayTests },
    { name: 'End-to-End Client/Gateway Integration', fn: runE2ETests }
  ];

  for (const suite of suites) {
    try {
      await suite.fn();
      passed++;
    } catch (err: any) {
      console.error(`  ❌ Suite '${suite.name}' failed:`, err);
      failed++;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`\n` + '═'.repeat(66));
  console.log(`Test Execution Summary: ${passed} passed, ${failed} failed in ${duration}ms`);
  console.log('═'.repeat(66) + `\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
