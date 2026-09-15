import * as crypto from 'node:crypto';

/**
 * High-performance, zero-third-party cryptographic primitives
 * using Node.js built-in crypto module.
 */

export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function hmacSha256(key: string | Buffer, data: string | Buffer): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPreimage(preimageHex: string, paymentHashHex: string): boolean {
  if (!preimageHex || !paymentHashHex) return false;
  try {
    const calculatedHash = sha256(Buffer.from(preimageHex, 'hex'));
    return constantTimeEqual(calculatedHash, paymentHashHex);
  } catch {
    return false;
  }
}

export function generateRandomHex(byteCount = 32): string {
  return crypto.randomBytes(byteCount).toString('hex');
}
