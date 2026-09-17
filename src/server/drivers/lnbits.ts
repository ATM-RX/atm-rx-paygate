import { Invoice, ServerSettlementDriver } from '../../types.js';
import { verifyPreimage } from '../../core/crypto.js';

export interface LNbitsConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Production LNbits Settlement Driver
 * Connects to a remote LNbits instance via REST API to generate real Bolt11 invoices
 * and check settlement status.
 */
export class LNbitsServerDriver implements ServerSettlementDriver {
  public name = 'lnbits';
  private baseUrl: string;
  private apiKey: string;

  constructor(config: LNbitsConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  public async createInvoice(
    amountSats: number,
    description: string,
    ttlSeconds = 600
  ): Promise<Invoice> {
    const url = `${this.baseUrl}/api/v1/payments`;
    const body = {
      out: false,
      amount: amountSats,
      memo: description,
      expiry: ttlSeconds
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LNbits invoice creation failed [${res.status}]: ${errText}`);
    }

    const data: any = await res.json();
    return {
      paymentHash: data.payment_hash,
      paymentRequest: data.payment_request || data.bolt11,
      amountSats,
      expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
      settled: false
    };
  }

  public async verifySettlement(paymentHash: string, preimage: string): Promise<boolean> {
    // 1. Cryptographic pre-check: SHA256(preimage) must equal paymentHash
    if (!verifyPreimage(preimage, paymentHash)) {
      return false;
    }

    // 2. Query LNbits payment status
    try {
      const url = `${this.baseUrl}/api/v1/payments/${paymentHash}`;
      const res = await fetch(url, {
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      if (!res.ok) return false;
      const data: any = await res.json();
      return data.paid === true;
    } catch {
      return false;
    }
  }
}
