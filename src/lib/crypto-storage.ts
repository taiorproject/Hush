export class CryptoStorage {
  private async deriveKey(roomKey: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(roomKey),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('hush-salt-v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(data: string, roomKey: string): Promise<string> {
    const key = await this.deriveKey(roomKey);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(encryptedData: string, roomKey: string): Promise<string> {
    const key = await this.deriveKey(roomKey);
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  }

  async saveEncrypted(key: string, data: any, roomKey: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    try {
      const json = JSON.stringify(data);
      const encrypted = await this.encrypt(json, roomKey);
      localStorage.setItem(key, encrypted);
    } catch (err) {
      console.error('Failed to save encrypted data:', err);
    }
  }

  async loadEncrypted<T>(key: string, roomKey: string): Promise<T | null> {
    if (typeof localStorage === 'undefined') return null;
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      const decrypted = await this.decrypt(encrypted, roomKey);
      return JSON.parse(decrypted) as T;
    } catch (err) {
      console.error('Failed to load encrypted data:', err);
      return null;
    }
  }
}
