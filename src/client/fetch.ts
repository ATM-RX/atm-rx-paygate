import { ClientSettlementDriver } from '../types.js';
import { CredentialVault } from './vault.js';
import { BudgetPolicyEngine, decodeBolt11Amount } from './policy.js';

export interface L402FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  driver: ClientSettlementDriver;
  vault?: CredentialVault;
  policy?: BudgetPolicyEngine;
  verbose?: boolean;
}

export interface L402FetchResult {
  status: number;
  headers: Headers;
  data: any;
  settled: boolean;
  amountSats?: number;
  preimage?: string;
}

/**
 * Autonomous L402 HTTP Request Engine
 * Automatically handles 402 negotiation, budget verification, settlement, and vault caching.
 */
export async function l402Fetch(url: string, options: L402FetchOptions): Promise<L402FetchResult> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const vault = options.vault || new CredentialVault();
  const policy = options.policy || new BudgetPolicyEngine();
  const verbose = options.verbose ?? false;

  const log = (msg: string) => {
    if (verbose) console.log(`[L402-CLIENT] ${msg}`);
  };

  // Step 1: Check Local Credential Vault
  const cachedToken = vault.getValidToken(url, method);
  if (cachedToken) {
    log(`Found cached unexpired token for ${method} ${url} in vault.`);
    headers.set('Authorization', `L402 ${cachedToken.macaroon}:${cachedToken.preimage}`);

    const res = await fetch(url, {
      method,
      headers,
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });

    if (res.status !== 401 && res.status !== 402) {
      log(`Cached token accepted with HTTP ${res.status}.`);
      let data: any;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      return {
        status: res.status,
        headers: res.headers,
        data,
        settled: false // used cached
      };
    }

    log(`Cached token rejected with HTTP ${res.status}. Evicting stale token and re-negotiating...`);
    vault.evict(url, method);
    headers.delete('Authorization');
  }

  // Step 2: Initial Request (Detecting 402 Challenge)
  log(`Executing initial request: ${method} ${url}`);
  const initialRes = await fetch(url, {
    method,
    headers,
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });

  if (initialRes.status !== 402) {
    log(`Endpoint did not require payment (HTTP ${initialRes.status}).`);
    let data: any;
    const contentType = initialRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await initialRes.json();
    } else {
      data = await initialRes.text();
    }
    return {
      status: initialRes.status,
      headers: initialRes.headers,
      data,
      settled: false
    };
  }

  // Step 3: Parse L402 Challenge
  log(`HTTP 402 Payment Required detected.`);
  const authHeader = initialRes.headers.get('WWW-Authenticate') || '';
  let macaroonStr = '';
  let invoiceStr = '';
  let amountSats = 0;
  let serverPreimage: string | undefined;

  // Check WWW-Authenticate header
  const macaroonMatch = authHeader.match(/macaroon="([^"]+)"/);
  const invoiceMatch = authHeader.match(/invoice="([^"]+)"/);

  if (macaroonMatch) macaroonStr = macaroonMatch[1];
  if (invoiceMatch) invoiceStr = invoiceMatch[1];

  // Also parse response JSON if available
  try {
    const jsonBody: any = await initialRes.json();
    if (!macaroonStr && jsonBody.macaroon) macaroonStr = jsonBody.macaroon;
    if (!invoiceStr && jsonBody.invoice) invoiceStr = jsonBody.invoice;
    if (jsonBody.amountSats) amountSats = jsonBody.amountSats;
    if (jsonBody.preimage) serverPreimage = jsonBody.preimage;
  } catch {
    // ignore json body failure
  }

  if (!macaroonStr || !invoiceStr) {
    throw new Error(`Malformed L402 challenge: Missing macaroon or invoice in server response.`);
  }

  // Fallback: derive amount from Bolt11 if not explicitly returned
  if (!amountSats) {
    const decoded = decodeBolt11Amount(invoiceStr);
    amountSats = decoded || 10;
  }

  log(`L402 Challenge parsed: Requires ${amountSats} satoshis.`);

  // Step 4: Budget Guard Verification
  policy.validateInvoiceAmount(amountSats, invoiceStr);
  log(`Budget policy verified: ${amountSats} sats within allowed ceiling.`);

  // Step 5: Settle Invoice via Configured Driver
  let preimage = '';
  if (options.driver.name === 'mock' && serverPreimage) {
    // In mock sandbox mode with server provided test preimage
    preimage = serverPreimage;
  } else {
    log(`Dispatching settlement to driver: ${options.driver.name.toUpperCase()}`);
    preimage = await options.driver.settle(invoiceStr, amountSats);
  }

  if (!preimage) {
    throw new Error(`Settlement driver failed to return valid preimage.`);
  }

  log(`Settlement verified. Preimage: ${preimage.slice(0, 16)}...`);
  policy.recordSpend(amountSats);

  // Step 6: Cache in Local Credential Vault
  vault.storeToken({
    urlPattern: url,
    method,
    macaroon: macaroonStr,
    preimage,
    paymentHash: '',
    amountSats,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    createdAt: Math.floor(Date.now() / 1000)
  });
  log(`Token securely stored in local vault.`);

  // Step 7: Re-Execute Request with L402 Authorization
  headers.set('Authorization', `L402 ${macaroonStr}:${preimage}`);
  log(`Re-executing request with Authorization: L402`);

  const authenticatedRes = await fetch(url, {
    method,
    headers,
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });

  let authenticatedData: any;
  const contentType = authenticatedRes.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    authenticatedData = await authenticatedRes.json();
  } else {
    authenticatedData = await authenticatedRes.text();
  }

  log(`Authenticated request complete: HTTP ${authenticatedRes.status}`);

  return {
    status: authenticatedRes.status,
    headers: authenticatedRes.headers,
    data: authenticatedData,
    settled: true,
    amountSats,
    preimage
  };
}
