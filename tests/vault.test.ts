import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CredentialVault } from '../src/client/vault.js';

export async function runVaultTests() {
  console.log('🧪 Testing Credential Vault & POSIX Permissions...');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l402-vault-test-'));
  const testVaultFile = path.join(tempDir, 'vault.json');

  try {
    const vault = new CredentialVault(testVaultFile);

    const testUrl = 'https://api.atm-rx.test/api/v1/sast-scan';
    const method = 'POST';
    const now = Math.floor(Date.now() / 1000);

    // 1. Initially empty
    assert.strictEqual(vault.getValidToken(testUrl, method), null);

    // 2. Store valid token
    vault.storeToken({
      urlPattern: testUrl,
      method,
      macaroon: 'test_macaroon_base64',
      preimage: '00112233445566778899aabbccddeeff',
      paymentHash: 'mock_hash',
      amountSats: 10,
      expiresAt: now + 3600,
      createdAt: now
    });

    const retrieved = vault.getValidToken(testUrl, method);
    assert.ok(retrieved !== null, 'Stored token must be retrievable');
    assert.strictEqual(retrieved?.preimage, '00112233445566778899aabbccddeeff');
    assert.strictEqual(retrieved?.amountSats, 10);

    // 3. POSIX Permissions Check (Linux/Unix)
    if (process.platform !== 'win32') {
      const stats = fs.statSync(testVaultFile);
      const mode = stats.mode & 0o777;
      assert.ok(mode === 0o600, `Vault file must have 0600 permissions, got 0${mode.toString(8)}`);
    }

    // 4. Expiration Eviction
    vault.storeToken({
      urlPattern: 'https://api.atm-rx.test/api/v1/expired',
      method: 'GET',
      macaroon: 'expired_macaroon',
      preimage: 'preimage_expired',
      paymentHash: 'expired_hash',
      amountSats: 5,
      expiresAt: now - 10, // already expired
      createdAt: now - 100
    });

    assert.strictEqual(
      vault.getValidToken('https://api.atm-rx.test/api/v1/expired', 'GET'),
      null,
      'Expired token must not be returned'
    );

    // 5. Explicit Eviction
    vault.evict(testUrl, method);
    assert.strictEqual(vault.getValidToken(testUrl, method), null, 'Evicted token must be null');

    console.log('  ✅ Vault tests passed.');
  } finally {
    // Cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
