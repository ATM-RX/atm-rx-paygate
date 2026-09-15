import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { VaultEntry } from '../types.js';

/**
 * Local L402 Credential Vault
 * Hardened file storage for purchased Macaroons and Preimages.
 * Enforces POSIX 0600 file permissions to prevent local token snooping.
 */
export class CredentialVault {
  private vaultPath: string;
  private entries: Map<string, VaultEntry> = new Map();

  constructor(customPath?: string) {
    if (customPath) {
      this.vaultPath = customPath;
    } else {
      const l402Dir = path.join(os.homedir(), '.l402');
      if (!fs.existsSync(l402Dir)) {
        fs.mkdirSync(l402Dir, { recursive: true, mode: 0o700 });
      }
      this.vaultPath = path.join(l402Dir, 'vault.json');
    }

    this.load();
  }

  private getKey(url: string, method: string): string {
    try {
      const parsed = new URL(url);
      return `${method.toUpperCase()}:${parsed.origin}${parsed.pathname}`;
    } catch {
      return `${method.toUpperCase()}:${url}`;
    }
  }

  public getValidToken(url: string, method: string): VaultEntry | null {
    const key = this.getKey(url, method);
    const entry = this.entries.get(key);
    if (!entry) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now >= entry.expiresAt) {
      // Evict expired token
      this.entries.delete(key);
      this.save();
      return null;
    }

    return entry;
  }

  public storeToken(entry: VaultEntry): void {
    const key = this.getKey(entry.urlPattern, entry.method);
    this.entries.set(key, entry);
    this.save();
  }

  public evict(url: string, method: string): boolean {
    const key = this.getKey(url, method);
    const existed = this.entries.delete(key);
    if (existed) {
      this.save();
    }
    return existed;
  }

  public list(): VaultEntry[] {
    const now = Math.floor(Date.now() / 1000);
    return Array.from(this.entries.values()).filter((e) => now < e.expiresAt);
  }

  public clear(): void {
    this.entries.clear();
    this.save();
  }

  private load(): void {
    if (!fs.existsSync(this.vaultPath)) return;
    try {
      // Check POSIX permissions on Unix/Linux
      if (process.platform !== 'win32') {
        const stats = fs.statSync(this.vaultPath);
        const mode = stats.mode & 0o777;
        if (mode !== 0o600 && mode !== 0o644) {
          fs.chmodSync(this.vaultPath, 0o600);
        }
      }

      const raw = fs.readFileSync(this.vaultPath, 'utf8');
      const list: VaultEntry[] = JSON.parse(raw);
      const now = Math.floor(Date.now() / 1000);

      this.entries.clear();
      for (const item of list) {
        if (now < item.expiresAt) {
          const key = this.getKey(item.urlPattern, item.method);
          this.entries.set(key, item);
        }
      }
    } catch (err) {
      console.error('[Vault] Failed to load credential vault:', err);
    }
  }

  private save(): void {
    try {
      const list = Array.from(this.entries.values());
      fs.writeFileSync(this.vaultPath, JSON.stringify(list, null, 2), {
        mode: 0o600
      });
    } catch (err) {
      console.error('[Vault] Failed to persist credential vault:', err);
    }
  }
}
