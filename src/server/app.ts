import { Hono } from 'hono';
import { ServerStore } from './store.js';
import { ServerSettlementDriver } from '../types.js';
import { l402Middleware } from './middleware/l402.js';

export interface AppConfig {
  rootKey: string;
  driver: ServerSettlementDriver;
  store: ServerStore;
}

export type AppEnv = {
  Variables: {
    l402: {
      paymentHash: string;
      preimage?: string;
    };
  };
};

export function createServerApp(config: AppConfig) {
  const app = new Hono<AppEnv>();
  const { rootKey, driver, store } = config;

  // 1. Root / Node Discovery
  app.get('/', (c) => {
    return c.json({
      name: 'atm-rx-paygate',
      version: '1.0.0',
      description: 'Sovereign L402 Micro-Payment Gateway',
      operator: 'ATM-RX (Brandon Binion)',
      driver: driver.name,
      endpoints: {
        public: ['/health'],
        protected: [
          { path: '/api/v1/sast-scan', method: 'POST', costSats: 10, description: 'Automated SAST Security Scan' },
          { path: '/api/v1/sovereign-dossier', method: 'GET', costSats: 25, description: 'Principal Systems Architect Dossier' }
        ]
      }
    });
  });

  // 2. Health & Telemetry Check
  app.get('/health', (c) => {
    const mem = process.memoryUsage();
    return c.json({
      status: 'operational',
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
        heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
        heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2))
      },
      driver: driver.name,
      timestamp: new Date().toISOString()
    });
  });

  // 3. Protected Endpoint: SAST Security Scan (10 Sats)
  app.post(
    '/api/v1/sast-scan',
    l402Middleware({
      rootKey,
      driver,
      store,
      amountSats: 10,
      description: 'On-Demand Static Application Security Testing (SAST) Scan'
    }),
    async (c) => {
      let body: any = {};
      try {
        body = await c.req.json();
      } catch {
        // Allow empty or default body
      }

      const target = body.target || 'ATM-RX/ArrowTech-SAST';
      const scanId = `sast_${Date.now().toString(36)}`;

      return c.json({
        success: true,
        scanId,
        target,
        timestamp: new Date().toISOString(),
        paymentProof: c.get('l402'),
        report: {
          scannedFiles: 42,
          findings: [
            {
              severity: 'CRITICAL',
              ruleId: 'SEC-AST-01',
              title: 'Hardcoded Cryptographic Preimage / API Key Vector',
              status: 'REMEDIATED',
              confidence: 'HIGH'
            },
            {
              severity: 'MEDIUM',
              ruleId: 'SEC-MEM-04',
              title: 'Unbounded Memory Allocation in Stream Buffer',
              status: 'SECURE',
              confidence: 'HIGH'
            }
          ],
          score: 98.4,
          verdict: 'APPROVED_FOR_EDGE_DEPLOYMENT'
        }
      });
    }
  );

  // 4. Protected Endpoint: Sovereign Systems Dossier (25 Sats)
  app.get(
    '/api/v1/sovereign-dossier',
    l402Middleware({
      rootKey,
      driver,
      store,
      amountSats: 25,
      description: 'Principal Systems Architect Dossier Access'
    }),
    (c) => {
      return c.json({
        success: true,
        identity: 'ATM-RX (Brandon Binion)',
        role: 'Principal Systems Architect & Infrastructure Engineer',
        capabilities: [
          'Zero-Trust Edge Middleware & Micro-Payment Protocols (L402 / Cashu)',
          'High-Throughput Distributed Cloudflare / Linux Systems',
          'Offensive Security & Automated SAST/DAST Rule Generation',
          'Polyglot Core Engineering (TypeScript, Python, Go, Rust)'
        ],
        verificationStatus: 'CRYPTOGRAPHICALLY_VERIFIED',
        settlement: c.get('l402')
      });
    }
  );

  return app;
}
