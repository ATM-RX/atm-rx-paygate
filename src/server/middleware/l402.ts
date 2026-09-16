import { Context, MiddlewareHandler } from 'hono';
import { ServerSettlementDriver } from '../../types.js';
import { ServerStore } from '../store.js';
import { deserializeMacaroon, mintMacaroon, serializeMacaroon, verifyMacaroon } from '../../core/macaroon.js';

export interface L402MiddlewareOptions {
  rootKey: string;
  driver: ServerSettlementDriver;
  store: ServerStore;
  amountSats: number;
  description?: string;
  ttlSeconds?: number;
}

/**
 * L402 HTTP 402 Payment Required Hono Middleware
 */
export function l402Middleware(options: L402MiddlewareOptions): MiddlewareHandler<any> {
  const { rootKey, driver, store, amountSats, description = 'API Access', ttlSeconds = 600 } = options;

  return async (c: Context<any>, next) => {
    const authHeader = c.req.header('Authorization');

    // Case A: Missing or non-L402 Authorization header -> Issue challenge
    if (!authHeader || (!authHeader.startsWith('L402 ') && !authHeader.startsWith('LSAT '))) {
      const invoice = await driver.createInvoice(amountSats, description, ttlSeconds);
      store.recordInvoice(invoice);

      const caveats = [
        { key: 'time_before', value: invoice.expiresAt.toString() },
        { key: 'path_exact', value: c.req.path },
        { key: 'method', value: c.req.method }
      ];

      const macaroon = mintMacaroon(rootKey, invoice.paymentHash, c.req.url, caveats);
      const serializedMacaroon = serializeMacaroon(macaroon);

      c.header('WWW-Authenticate', `L402 macaroon="${serializedMacaroon}", invoice="${invoice.paymentRequest}"`);
      return c.json(
        {
          error: 'Payment Required',
          protocol: 'L402',
          amountSats,
          paymentHash: invoice.paymentHash,
          invoice: invoice.paymentRequest,
          macaroon: serializedMacaroon,
          preimage: (invoice as any).preimage // available in mock mode for instant developer sandbox testing
        },
        402
      );
    }

    // Case B: Authorization header present -> Validate credentials
    const tokenPart = authHeader.replace(/^(L402|LSAT)\s+/, '').trim();
    const [rawMacaroon, preimage] = tokenPart.split(':');

    if (!rawMacaroon || !preimage) {
      return c.json(
        {
          error: 'Malformed L402 Authorization header. Expected format: Authorization: L402 <macaroon>:<preimage>'
        },
        401
      );
    }

    // 1. Deserialize and verify Macaroon cryptographic signature & caveats
    let macaroon;
    try {
      macaroon = deserializeMacaroon(rawMacaroon);
    } catch (err: any) {
      return c.json({ error: `Invalid Macaroon: ${err.message}` }, 401);
    }

    const macaroonResult = verifyMacaroon(rootKey, macaroon, {
      path: c.req.path,
      method: c.req.method
    });

    if (!macaroonResult.valid) {
      return c.json({ error: `Macaroon verification failed: ${macaroonResult.reason}` }, 401);
    }

    const paymentHash = macaroon.identifier;

    // 2. Verify settlement proof (preimage) via the driver
    const isSettled = await driver.verifySettlement(paymentHash, preimage);
    if (!isSettled) {
      return c.json(
        { error: 'Payment verification failed: Preimage does not satisfy payment hash or is unpaid' },
        402
      );
    }

    // Extract time_before caveat if present for expiry
    let expiresAt: number | undefined;
    const timeCaveat = macaroon.caveats.find((cv) => cv.key === 'time_before');
    if (timeCaveat) {
      const parsed = parseInt(timeCaveat.value, 10);
      if (!isNaN(parsed)) expiresAt = parsed;
    }

    // Edge Replay Barrier: Check Cloudflare Cache API if running in Workers edge runtime
    if (typeof caches !== 'undefined' && (caches as any).default) {
      try {
        const edgeCache = (caches as any).default;
        const cacheKey = new Request(`https://atm-rx-paygate.internal/spent/${paymentHash}`);
        const cached = await edgeCache.match(cacheKey);
        if (cached) {
          return c.json(
            { error: 'Authorization rejected: Payment hash has already been consumed (edge replay attempt)' },
            409
          );
        }
        const ttl = Math.max(60, (expiresAt || (Math.floor(Date.now() / 1000) + 600)) - Math.floor(Date.now() / 1000));
        await edgeCache.put(
          cacheKey,
          new Response('spent', {
            headers: { 'Cache-Control': `public, max-age=${ttl}` }
          })
        );
      } catch {
        // Cache API fallback gracefully to isolate in-memory ledger
      }
    }

    // 3. Atomic single-flight spend lock (prevents double-spend and in-isolate replay attacks)
    const consumeResult = store.atomicConsume(paymentHash, { allowUnrecorded: true, expiresAt });
    if (!consumeResult.success) {
      return c.json(
        {
          error: `Authorization rejected: ${consumeResult.reason}`
        },
        409
      );
    }

    // Successfully verified and spent
    c.set('l402', {
      paymentHash,
      preimage
    });

    await next();
  };
}
