import { ClientSettlementDriver } from '../../types.js';

export interface LNbitsClientConfig {
  baseUrl: string;
  adminKey: string;
}

/**
 * Headless LNbits Client Settlement Driver
 * Automatically settles invoices via outbound payment API.
 */
export class LNbitsClientDriver implements ClientSettlementDriver {
  public name = 'lnbits';
  private baseUrl: string;
  private adminKey: string;

  constructor(config: LNbitsClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.adminKey = config.adminKey;
  }

  public async settle(invoice: string, amountSats: number): Promise<string> {
    const url = `${this.baseUrl}/api/v1/payments`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.adminKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        out: true,
        bolt11: invoice
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LNbits outbound payment failed [${res.status}]: ${errText}`);
    }

    const data: any = await res.json();
    if (!data.payment_hash) {
      throw new Error('LNbits outbound payment did not return payment_hash');
    }

    // Query payment details to obtain preimage
    const statusUrl = `${this.baseUrl}/api/v1/payments/${data.payment_hash}`;
    const statusRes = await fetch(statusUrl, {
      headers: {
        'X-Api-Key': this.adminKey
      }
    });

    if (!statusRes.ok) {
      throw new Error(`Failed to fetch settlement preimage from LNbits`);
    }

    const statusData: any = await statusRes.json();
    if (!statusData.preimage) {
      throw new Error('Settlement pending or preimage not returned by node');
    }

    return statusData.preimage;
  }
}
