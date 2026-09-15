import assert from 'node:assert';
import {
  sha256,
  hmacSha256,
  constantTimeEqual,
  verifyPreimage,
  generateRandomHex
} from '../src/core/crypto.js';
import {
  mintMacaroon,
  serializeMacaroon,
  deserializeMacaroon,
  verifyMacaroon
} from '../src/core/macaroon.js';

export async function runCryptoTests() {
  console.log('🧪 Testing Cryptographic & Macaroon Primitives...');

  // 1. SHA-256 and Preimage verification
  const preimage = generateRandomHex(32);
  const paymentHash = sha256(Buffer.from(preimage, 'hex'));
  assert.strictEqual(verifyPreimage(preimage, paymentHash), true, 'Valid preimage must verify against hash');
  assert.strictEqual(verifyPreimage(generateRandomHex(32), paymentHash), false, 'Wrong preimage must fail');

  // 2. Constant Time Equality
  assert.strictEqual(constantTimeEqual(paymentHash, paymentHash), true, 'Identical strings must return true');
  assert.strictEqual(constantTimeEqual(paymentHash, generateRandomHex(32)), false, 'Different strings must return false');

  // 3. Macaroon Minting & Serialization
  const rootKey = 'secret_test_root_key_123';
  const location = 'https://api.atm-rx.test';
  const now = Math.floor(Date.now() / 1000);
  const caveats = [
    { key: 'time_before', value: (now + 600).toString() },
    { key: 'path_exact', value: '/api/v1/sast-scan' },
    { key: 'method', value: 'POST' }
  ];

  const macaroon = mintMacaroon(rootKey, paymentHash, location, caveats);
  assert.strictEqual(macaroon.identifier, paymentHash);
  assert.strictEqual(macaroon.caveats.length, 3);

  const serialized = serializeMacaroon(macaroon);
  assert.ok(typeof serialized === 'string' && serialized.length > 20, 'Serialized macaroon must be base64url string');

  const deserialized = deserializeMacaroon(serialized);
  assert.deepStrictEqual(deserialized, macaroon, 'Deserialized macaroon must match original exactly');

  // 4. Verification: Valid Case
  const validCheck = verifyMacaroon(rootKey, deserialized, {
    path: '/api/v1/sast-scan',
    method: 'POST',
    nowSeconds: now
  });
  assert.strictEqual(validCheck.valid, true, 'Valid macaroon must pass verification');

  // 5. Verification: Path Mismatch
  const pathCheck = verifyMacaroon(rootKey, deserialized, {
    path: '/api/v1/different-endpoint',
    method: 'POST',
    nowSeconds: now
  });
  assert.strictEqual(pathCheck.valid, false, 'Path mismatch must fail verification');

  // 6. Verification: Expired
  const expiredCheck = verifyMacaroon(rootKey, deserialized, {
    path: '/api/v1/sast-scan',
    method: 'POST',
    nowSeconds: now + 1000
  });
  assert.strictEqual(expiredCheck.valid, false, 'Expired macaroon must fail verification');

  // 7. Verification: Tampered Signature
  const tamperedMacaroon = { ...deserialized, signature: generateRandomHex(32) };
  const tamperedCheck = verifyMacaroon(rootKey, tamperedMacaroon, {
    path: '/api/v1/sast-scan',
    method: 'POST',
    nowSeconds: now
  });
  assert.strictEqual(tamperedCheck.valid, false, 'Tampered signature must fail verification');

  console.log('  ✅ Crypto and Macaroon tests passed.');
}
