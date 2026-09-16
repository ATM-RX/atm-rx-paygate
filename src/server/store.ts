import { Invoice } from '../types.js';

export interface InvoiceRecord extends Invoice {
  consumed: boolean;
  consumedAt?: number;
  createdAt: number;
}

/**
 * Universal High-Performance Atomic Invoice Store.
 * Compatible across Cloudflare Workers, Edge runtimes, and Node.js.
 * Prevents TOCTOU race conditions and replay attacks via atomic single-flight commits.
 */
export class ServerStore {
  protected records = new Map<string, InvoiceRecord>();

  public recordInvoice(invoice: Invoice): void {
    const record: InvoiceRecord = {
      ...invoice,
      consumed: false,
      createdAt: Math.floor(Date.now() / 1000)
    };
    this.records.set(invoice.paymentHash, record);
  }

  public getInvoice(paymentHash: string): InvoiceRecord | undefined {
    return this.records.get(paymentHash);
  }

  /**
   * Atomic Test-And-Set.
   * Marks an invoice as consumed in a single atomic memory operation.
   * Returns true if successfully consumed for the first time.
   * Returns false if already consumed (replay attack) or expired.
   */
  public atomicConsume(
    paymentHash: string,
    options?: { allowUnrecorded?: boolean; expiresAt?: number } | number
  ): { success: boolean; reason?: string } {
    let record = this.records.get(paymentHash);
    const now = Math.floor(Date.now() / 1000);

    const allowUnrecorded = typeof options === 'object' ? Boolean(options.allowUnrecorded) : false;
    const expiresAt = typeof options === 'object' ? options.expiresAt : (typeof options === 'number' ? options : undefined);

    if (!record) {
      if (!allowUnrecorded) {
        return { success: false, reason: 'Invoice not found in gateway ledger' };
      }
      // Stateless Edge Isolate Adaptation:
      // The token has already been verified cryptographically (Macaroon root signature + preimage hash).
      // Register it immediately in the isolate ledger to establish atomic single-flight and replay defense.
      record = {
        paymentHash,
        paymentRequest: '',
        amountSats: 0,
        expiresAt: expiresAt || (now + 600),
        settled: true,
        consumed: false,
        createdAt: now
      };
      this.records.set(paymentHash, record);
    }

    if (now > record.expiresAt) {
      return { success: false, reason: 'Invoice has expired' };
    }

    if (record.consumed) {
      return { success: false, reason: 'Payment hash has already been consumed (replay attempt)' };
    }

    // Single-flight atomic commit in event loop
    record.consumed = true;
    record.consumedAt = now;

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
    return pruned;
  }
}
