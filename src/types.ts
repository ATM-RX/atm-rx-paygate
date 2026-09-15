/**
 * atm-rx-paygate / atm-rx-l402
 * Core domain types and L402 protocol interfaces
 */

export interface Caveat {
  key: string;
  value: string;
}

export interface Macaroon {
  version: number;
  location: string;
  identifier: string; // payment_hash (hex)
  caveats: Caveat[];
  signature: string; // hex
}

export interface L402Challenge {
  macaroon: string; // serialized base64
  invoice: string;  // bolt11 payment request
}

export interface Invoice {
  paymentHash: string;
  paymentRequest: string;
  amountSats: number;
  expiresAt: number; // Unix timestamp in seconds
  settled: boolean;
  preimage?: string;
}

export interface BudgetPolicy {
  maxSatsPerRequest: number;
  dailyBudgetSats: number;
}

export interface VaultEntry {
  urlPattern: string;
  method: string;
  macaroon: string;
  preimage: string;
  paymentHash: string;
  amountSats: number;
  expiresAt: number;
  createdAt: number;
}

export interface ServerSettlementDriver {
  name: string;
  createInvoice(amountSats: number, description: string, ttlSeconds?: number): Promise<Invoice>;
  verifySettlement(paymentHash: string, preimage: string): Promise<boolean>;
}

export interface ClientSettlementDriver {
  name: string;
  settle(invoice: string, amountSats: number): Promise<string>; // returns preimage hex
}
