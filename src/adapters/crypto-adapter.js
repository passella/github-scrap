export function uint8ArrayToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function deriveKey(password, salt, iterations = 100000) {
  const enc = new TextEncoder();
  const passwordKey = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptProfiles(profiles, password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required for encryption');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, 100000);
  const enc = new TextEncoder();
  const encoded = enc.encode(JSON.stringify(profiles));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    cipher: 'AES-256-GCM',
    iterations: 100000,
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    data: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    exportedAt: new Date().toISOString(),
  };
}

export async function decryptProfiles(encryptedPayload, password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required for decryption');
  }
  const payload = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload;
  if (!payload || !payload.salt || !payload.iv || !payload.data) {
    throw new Error('Invalid encrypted backup payload format');
  }
  const salt = base64ToUint8Array(payload.salt);
  const iv = base64ToUint8Array(payload.iv);
  const ciphertext = base64ToUint8Array(payload.data);
  const key = await deriveKey(password, salt, payload.iterations || 100000);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const dec = new TextDecoder();
  const jsonStr = dec.decode(decrypted);
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error('Decrypted content is not a valid profiles array');
  }
  return parsed;
}

export class CryptoAdapter {
  static encryptProfiles(profiles, password) {
    return encryptProfiles(profiles, password);
  }

  static decryptProfiles(encryptedPayload, password) {
    return decryptProfiles(encryptedPayload, password);
  }
}
