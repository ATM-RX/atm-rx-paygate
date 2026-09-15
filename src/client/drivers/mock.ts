import { ClientSettlementDriver } from '../../types.js';
import { generateRandomHex, sha256 } from '../../core/crypto.js';

/**
 * Mock Client Settlement Driver
 * Instant offline settlement for automated testing & development.
 */
export class MockClientDriver implements ClientSettlementDriver {
  public name = 'mock';
  private knownPreimages: Map<string, string>;

  constructor(preimageStore?: Map<string, string>) {
    this.knownPreimages = preimageStore || new Map();
  }

  public async settle(invoice: string, amountSats: number): Promise<string> {
    // In mock mode, if the invoice contains a mock payment hash pattern, derive or return dummy preimage
    // Check if we have a known preimage or generate a valid 32-byte hex preimage
    return generateRandomHex(32);
  }
}
