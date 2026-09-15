import * as fs from 'node:fs';
import * as path from 'node:path';
import { Invoice } from '../types.js';

interface InvoiceRecord extends Invoice {
  consumed: boolean;
  consumedAt?: number;
  createdAt: number;
}

/**
 * High-performance, zero-dependency atomic invoice store.
 * Prevents TOCTOU race conditions and replay attacks.
 */
export class ServerStore {
  private records = new Map<string, InvoiceRecord>();
  private filePath?: string;

  constructor(filePath?: string) {
    this.filePath = filePath;
    if (this.filePath && fs.existsSync(this.filePath)) {
      this.load();
    }
  }

  public recordInvoice(invoice: Invoice): void {
    const record: InvoiceRecord = {
      ...invoice,
      consumed: false,
      createdAt: Math.floor(Date.now() / 1000)
    };
    this.records.set(invoice.paymentHash, record);
    this.persist();
  }

  public getInvoice(paymentHash: string): InvoiceRecord | undefined {
    return this.records.get(paymentHash);
  }

  /**
   * Atomic Test-And-Set.
   * Marks an invoice as consumed in a single atomic memory operation.
   * Returns true if successfully consumed for the first time.
   * Returns false if already consumed (replay attack) or not found.
   */
  public atomicConsume(paymentHash: string): { success: boolean; reason?: string } {
    const record = this.records.get(paymentHash);
    if (!record) {
      return { success: false, reason: 'Invoice not found in gateway ledger' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > record.expiresAt) {
      return { success: false, reason: 'Invoice has expired' };
    }

    if (record.consumed) {
      return { success: false, reason: 'Payment hash has already been consumed (replay attempt)' };
    }

    // Single-flight atomic commit in Node event loop
    record.consumed = true;
    record.consumedAt = now;
    this.persist();

    return { success: true };
  }

  public pruneExpired(): number {
    const now = Math.floor(Date.now() / 1000);
    let pruned = 0;
    for (const [hash, record] of this.records.entries()) {
      if (now > record.expiresAt && !record.consumed) {
        this.records.delete(hash);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.persist();
    }
    return pruned;
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.records.entries()), null, 2);
      // Atomic write via temp file + rename
      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, data, 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[Store] Failed to persist ledger:', err);
    }
  }

  private load(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      const entries: [string, InvoiceRecord][] = JSON.parse(data);
      this.records = new Map(entries);
    } catch (err) {
      console.error('[Store] Failed to load ledger:', err);
    }
  }
}
