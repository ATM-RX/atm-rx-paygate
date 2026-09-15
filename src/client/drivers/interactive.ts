import * as readline from 'node:readline';
import qrcode from 'qrcode-terminal';
import { ClientSettlementDriver } from '../../types.js';

/**
 * Interactive Terminal Settlement Driver
 * Renders an ASCII QR code directly into stdout and prompts the operator for settlement proof.
 */
export class InteractiveClientDriver implements ClientSettlementDriver {
  public name = 'interactive';

  public async settle(invoice: string, amountSats: number): Promise<string> {
    console.log('\n' + '═'.repeat(64));
    console.log(`⚡ L402 PAYMENT REQUIRED: ${amountSats} Satoshis`);
    console.log('═'.repeat(64));

    // Render ASCII QR Code
    qrcode.generate(invoice.toUpperCase(), { small: true });

    console.log('\n📋 BOLT11 INVOICE:');
    console.log(invoice);
    console.log('═'.repeat(64));

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('\n🔑 Enter payment preimage (hex): ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}
