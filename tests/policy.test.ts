import assert from 'node:assert';
import { BudgetPolicyEngine, decodeBolt11Amount, BudgetPolicyError } from '../src/client/policy.js';

export async function runPolicyTests() {
  console.log('🧪 Testing Budget Guard & Invoice Decoder...');

  // 1. decodeBolt11Amount tests
  assert.strictEqual(decodeBolt11Amount('lnbc100n1p...'), 10, '100n must equal 10 sats');
  assert.strictEqual(decodeBolt11Amount('lnbc50u1p...'), 5000, '50u must equal 5000 sats');
  assert.strictEqual(decodeBolt11Amount('invalid_invoice'), null, 'Invalid invoice must return null');

  // 2. Budget Guard: Max Sats Per Request
  const policy = new BudgetPolicyEngine({
    maxSatsPerRequest: 20,
    dailyBudgetSats: 100
  });
  policy.resetDailySpend();

  // Under ceiling -> allowed
  assert.doesNotThrow(() => {
    policy.validateInvoiceAmount(10);
  });

  // Over ceiling -> must throw BudgetPolicyError
  assert.throws(
    () => {
      policy.validateInvoiceAmount(25);
    },
    (err: any) => err instanceof BudgetPolicyError && err.message.includes('exceeds client policy maximum'),
    'Request exceeding max fee limit must trigger BudgetPolicyError'
  );

  // 3. Daily Budget Cumulative Limit
  policy.recordSpend(90);
  const status = policy.getDailyStatus();
  assert.ok(status.spentSats >= 90, 'Spent sats must reflect recorded spend');

  // Requesting 15 sats: 15 <= 20 (passes per-request), but spentSats(90) + 15 = 105 > dailyBudget(100)
  assert.throws(
    () => {
      policy.validateInvoiceAmount(15);
    },
    (err: any) => err instanceof BudgetPolicyError && err.message.includes('Daily budget exceeded'),
    'Cumulative spend exceeding daily budget must throw BudgetPolicyError'
  );

  console.log('  ✅ Budget policy tests passed.');
}
