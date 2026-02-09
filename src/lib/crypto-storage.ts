export class CryptoStorage {
  private async deriveKey(roomKey: string, salt: Uint8Array): Promise<CryptoKey> {
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
        salt: salt.buffer as ArrayBuffer,
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
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await this.deriveKey(roomKey, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );

    // Format: [16 bytes salt] [12 bytes iv] [ciphertext]
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(encryptedData: string, roomKey: string): Promise<string> {
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);

    const key = await this.deriveKey(roomKey, salt);

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
