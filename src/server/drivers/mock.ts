import { Invoice, ServerSettlementDriver } from '../../types.js';
import { generateRandomHex, sha256, verifyPreimage } from '../../core/crypto.js';
import { Buffer } from 'node:buffer';

/**
 * Sandbox Mock Settlement Driver
 * Allows offline, zero-cost testing of L402 challenge, invoice creation, and preimage verification.
 */
export class MockServerDriver implements ServerSettlementDriver {
  public name = 'mock';
  private preimages = new Map<string, string>(); // paymentHash -> preimage

  public async createInvoice(
    amountSats: number,
    description: string,
    ttlSeconds = 600
  ): Promise<Invoice> {
    const preimage = generateRandomHex(32);
    const paymentHash = sha256(Buffer.from(preimage, 'hex'));

    this.preimages.set(paymentHash, preimage);

    // Generate compliant mock Bolt11 string
    const paymentRequest = `lnbc${amountSats}0n1p${paymentHash.slice(0, 20)}mock${generateRandomHex(8)}`;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    return {
      paymentHash,
      paymentRequest,
      amountSats,
      expiresAt,
      settled: false,
      preimage // Included in mock mode for easy sandbox automated verification
    };
  }

  public async verifySettlement(paymentHash: string, preimage: string): Promise<boolean> {
    const knownPreimage = this.preimages.get(paymentHash);
    if (!knownPreimage) {
      // Fall back to direct cryptographic verification: SHA256(preimage) === paymentHash
      return verifyPreimage(preimage, paymentHash);
    }
    return knownPreimage === preimage && verifyPreimage(preimage, paymentHash);
  }

  public getPreimage(paymentHash: string): string | undefined {
    return this.preimages.get(paymentHash);
  }
}
