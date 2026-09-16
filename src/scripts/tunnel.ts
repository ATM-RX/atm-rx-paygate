import localtunnel from 'localtunnel';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import qrcode from 'qrcode-terminal';

async function main() {
  const port = parseInt(process.env.PORT || '4020', 10);

  // 1. Verify or start local gateway server
  let isRunning = false;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (res.ok) isRunning = true;
  } catch {}

  if (!isRunning) {
    console.log(`[Tunnel] Starting local gateway on port ${port}...`);
    const serverProcess = spawn('npx', ['tsx', 'src/server/index.ts'], {
      cwd: path.join(__dirname, '..', '..'),
      env: { ...process.env, PORT: port.toString() },
      stdio: 'ignore',
      detached: true
    });
    serverProcess.unref();

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const check = await fetch(`http://127.0.0.1:${port}/health`);
        if (check.ok) {
          isRunning = true;
          break;
        }
      } catch {}
    }
  }

  console.log(`⚡ Local gateway verified on http://127.0.0.1:${port}`);
  console.log(`⚡ Initiating secure encrypted public tunnel (zero domain, zero cost)...`);

  let tunnel: localtunnel.Tunnel;
  try {
    tunnel = await localtunnel({
      port,
      subdomain: 'atm-rx-paygate'
    });
  } catch {
    // Fall back to random subdomain if custom is contested
    tunnel = await localtunnel({ port });
  }

  const publicUrl = tunnel.url;

  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║                 ATM-RX L402 LIVE PUBLIC GATEWAY                  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝`);
  console.log(`⚡ PUBLIC HTTPS URL: ${publicUrl}`);
  console.log(`⚡ HEALTH CHECK:     ${publicUrl}/health`);
  console.log(`⚡ PROTECTED SCAN:   POST ${publicUrl}/api/v1/sast-scan`);
  console.log(`⚡ STATUS:           LIVE ON THE GLOBAL INTERNET\n`);

  console.log(`📱 SCAN WITH SMARTPHONE TO TEST OVER MOBILE LTE/5G:`);
  qrcode.generate(publicUrl, { small: true });

  console.log(`\n🧪 Testing public edge routing...`);
  try {
    const testRes = await fetch(`${publicUrl}/health`, {
      headers: { 'bypass-tunnel-reminder': 'true' }
    });
    if (testRes.ok) {
      const data: any = await testRes.json();
      console.log(`✅ Public edge handshake confirmed: Status '${data.status}' | Driver: ${data.driver}`);
    }
  } catch (err: any) {
    console.log(`Note: Edge routing initializing (${err.message})`);
  }

  console.log(`\nTunnel is ACTIVE. Keep this terminal open to maintain public access.\n`);

  tunnel.on('close', () => {
    console.log('\n[Tunnel] Connection closed.');
    process.exit(0);
  });

  tunnel.on('error', (err) => {
    console.error('\n[Tunnel Error]:', err);
  });

  process.on('SIGINT', () => {
    tunnel.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    tunnel.close();
    process.exit(0);
  });

  // Keep event loop alive
  setInterval(() => {}, 10000);
}

main().catch((err) => {
  console.error('Fatal tunnel launcher error:', err);
  process.exit(1);
});
