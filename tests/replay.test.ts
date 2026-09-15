import assert from 'node:assert';
import { ServerStore } from '../src/server/store.js';
import { Invoice } from '../src/types.js';

export async function runReplayTests() {
  console.log('🧪 Testing ServerStore Atomic Anti-Replay Ledger...');

  const store = new ServerStore();
  const paymentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const now = Math.floor(Date.now() / 1000);

  const mockInvoice: Invoice = {
    paymentHash,
    paymentRequest: 'lnbc100n1mock...',
    amountSats: 10,
    expiresAt: now + 600,
    settled: false
  };

  store.recordInvoice(mockInvoice);

  // 1. First consumption attempt -> MUST SUCCEED
  const firstConsume = store.atomicConsume(paymentHash);
  assert.strictEqual(firstConsume.success, true, 'First spend must succeed');

  // 2. Replay attempt with identical payment hash -> MUST BE REJECTED
  const secondConsume = store.atomicConsume(paymentHash);
  assert.strictEqual(secondConsume.success, false, 'Second spend must be rejected as replay attack');
  assert.ok(secondConsume.reason?.includes('replay'), 'Rejection reason must indicate replay attempt');

  // 3. Non-existent payment hash -> MUST FAIL
  const unknownConsume = store.atomicConsume('unknown_hash_12345');
  assert.strictEqual(unknownConsume.success, false, 'Unknown payment hash must fail');

  console.log('  ✅ Anti-replay and atomic spend tests passed.');
}
