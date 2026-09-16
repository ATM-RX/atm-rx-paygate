import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BudgetPolicy } from '../types.js';

export class BudgetPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetPolicyError';
  }
}

interface DailyBudgetRecord {
  date: string; // YYYY-MM-DD
  spentSats: number;
}

/**
 * Client-Side Budget Guard
 * Protects developer / agent from malicious server invoice draining.
 */
export class BudgetPolicyEngine {
  private policy: BudgetPolicy;
  private budgetFilePath: string;

  constructor(policy?: Partial<BudgetPolicy>, customBudgetFilePath?: string) {
    this.policy = {
      maxSatsPerRequest: policy?.maxSatsPerRequest ?? 50,
      dailyBudgetSats: policy?.dailyBudgetSats ?? 500
    };

    if (customBudgetFilePath) {
      this.budgetFilePath = customBudgetFilePath;
    } else {
      const l402Dir = path.join(os.homedir(), '.l402');
      if (!fs.existsSync(l402Dir)) {
        fs.mkdirSync(l402Dir, { recursive: true, mode: 0o700 });
      }
      this.budgetFilePath = path.join(l402Dir, 'budget.json');
    }
  }

  public resetDailySpend(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.saveDailyBudget({ date: today, spentSats: 0 });
  }

  public validateInvoiceAmount(amountSats: number, invoiceStr?: string): void {
    if (amountSats <= 0) {
      throw new BudgetPolicyError(`Invalid invoice amount: ${amountSats} sats`);
    }

    // 1. Check max per-request ceiling
    if (amountSats > this.policy.maxSatsPerRequest) {
      throw new BudgetPolicyError(
        `[SECURITY HALT] Requested fee (${amountSats} sats) exceeds client policy maximum (${this.policy.maxSatsPerRequest} sats). Aborting settlement.`
      );
    }

    // 2. Check cumulative daily budget
    const today = new Date().toISOString().split('T')[0];
    const record = this.loadDailyBudget(today);

    if (record.spentSats + amountSats > this.policy.dailyBudgetSats) {
      throw new BudgetPolicyError(
        `[SECURITY HALT] Daily budget exceeded. Spent today: ${record.spentSats} sats + request ${amountSats} sats > limit ${this.policy.dailyBudgetSats} sats.`
      );
    }
  }

  public recordSpend(amountSats: number): void {
    const today = new Date().toISOString().split('T')[0];
    const record = this.loadDailyBudget(today);
    record.spentSats += amountSats;
    this.saveDailyBudget(record);
  }

  public getDailyStatus(): { date: string; spentSats: number; remainingSats: number; dailyLimit: number } {
    const today = new Date().toISOString().split('T')[0];
    const record = this.loadDailyBudget(today);
    return {
      date: today,
      spentSats: record.spentSats,
      remainingSats: Math.max(0, this.policy.dailyBudgetSats - record.spentSats),
      dailyLimit: this.policy.dailyBudgetSats
    };
  }

  private loadDailyBudget(date: string): DailyBudgetRecord {
    try {
      if (fs.existsSync(this.budgetFilePath)) {
        const raw = fs.readFileSync(this.budgetFilePath, 'utf8');
        const data: DailyBudgetRecord = JSON.parse(raw);
        if (data && data.date === date) {
          return data;
        }
      }
    } catch {
      // ignore parse errors and reset
    }
    return { date, spentSats: 0 };
  }

  private saveDailyBudget(record: DailyBudgetRecord): void {
    try {
      fs.writeFileSync(this.budgetFilePath, JSON.stringify(record, null, 2), {
        mode: 0o600
      });
    } catch (err) {
      console.error('[BudgetGuard] Failed to persist daily budget:', err);
    }
  }
}

/**
 * Lightweight Bolt11 satoshi decoder
 */
export function decodeBolt11Amount(invoice: string): number | null {
  const match = invoice.toLowerCase().match(/^lnbc([0-9]+)([munp]?)/);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  const multiplier = match[2];

  if (isNaN(num)) return null;

  switch (multiplier) {
    case 'm': // milli (0.001 BTC = 100,000 sats)
      return num * 100000;
    case 'u': // micro (0.000001 BTC = 100 sats)
      return num * 100;
    case 'n': // nano (0.000000001 BTC = 0.1 sats)
      return Math.round(num * 0.1);
    case 'p': // pico (0.000000000001 BTC = 0.0001 sats)
      return Math.round(num * 0.0001);
    default:
      // No multiplier means BTC
      return num * 100000000;
  }
}
