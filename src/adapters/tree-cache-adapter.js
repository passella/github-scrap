const DB_NAME = 'github-scrap-cache';
const DB_VERSION = 1;
const STORE_NAME = 'git-trees';
const FALLBACK_PREFIX = 'github-scrap:idb-tree-cache:';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const memoryFallbackStore = new Map();

function uint8ToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function compressJsonPayload(data) {
  const jsonString = JSON.stringify(data);
  if (typeof CompressionStream === 'function' && typeof Response === 'function') {
    try {
      const encoded = new TextEncoder().encode(jsonString);
      const stream = new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'));
      const buffer = await new Response(stream).arrayBuffer();
      return {
        compressed: true,
        payload: new Uint8Array(buffer),
      };
    } catch {
    }
  }
  return {
    compressed: false,
    payload: jsonString,
  };
}

export async function decompressJsonPayload(record) {
  if (!record || record.payload === undefined || record.payload === null) {
    return null;
  }
  if (record.compressed && typeof DecompressionStream === 'function' && typeof Response === 'function') {
    let bytes = record.payload;
    if (typeof bytes === 'string') {
      bytes = base64ToUint8(bytes);
    } else if (bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    } else if (ArrayBuffer.isView(bytes)) {
      bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }
  if (typeof record.payload === 'string') {
    return JSON.parse(record.payload);
  }
  return record.payload;
}

export class TreeCacheAdapter {
  static DEFAULT_TTL_MS = DEFAULT_TTL_MS;
  static dbPromise = null;

  static isIndexedDBAvailable() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null && typeof indexedDB.open === 'function';
  }

  static openDatabase() {
    if (!this.isIndexedDBAvailable()) {
      return Promise.resolve(null);
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }
    this.dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          this.dbPromise = null;
          resolve(null);
        };
      } catch {
        this.dbPromise = null;
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  static readFallbackRecord(key) {
    const storageKey = FALLBACK_PREFIX + key;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch {
      }
    }
    return memoryFallbackStore.get(key) || null;
  }

  static writeFallbackRecord(key, record) {
    const storageKey = FALLBACK_PREFIX + key;
    const serializableRecord = {
      key: record.key,
      compressed: Boolean(record.compressed),
      payload: record.compressed && record.payload instanceof Uint8Array
        ? uint8ToBase64(record.payload)
        : record.payload,
      updatedAt: record.updatedAt,
      ttlMs: record.ttlMs,
    };
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(serializableRecord));
        return;
      } catch {
      }
    }
    memoryFallbackStore.set(key, serializableRecord);
  }

  static async set(key, data, { ttlMs = DEFAULT_TTL_MS } = {}) {
    if (!key || data === undefined) return false;
    const compressedObj = await compressJsonPayload(data);
    const record = {
      key,
      compressed: compressedObj.compressed,
      payload: compressedObj.payload,
      updatedAt: Date.now(),
      ttlMs: typeof ttlMs === 'number' ? ttlMs : DEFAULT_TTL_MS,
    };

    this.writeFallbackRecord(key, record);

    const db = await this.openDatabase();
    if (!db) {
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  static async get(key, { allowExpired = false, ttlMs = DEFAULT_TTL_MS } = {}) {
    if (!key) return null;

    let record = null;
    const db = await this.openDatabase();
    if (db) {
      record = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    if (!record) {
      record = this.readFallbackRecord(key);
    }

    if (!record) {
      return null;
    }

    const effectiveTtl = typeof record.ttlMs === 'number' ? record.ttlMs : ttlMs;
    const ageMs = Date.now() - (record.updatedAt || 0);
    const isExpired = ageMs > effectiveTtl;

    if (isExpired && !allowExpired) {
      return null;
    }

    try {
      const data = await decompressJsonPayload(record);
      if (data === null || data === undefined) return null;
      return {
        data,
        expired: isExpired,
        updatedAt: record.updatedAt,
        compressed: Boolean(record.compressed),
      };
    } catch {
      return null;
    }
  }

  static async clear() {
    memoryFallbackStore.clear();
    if (typeof sessionStorage !== 'undefined') {
      try {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(FALLBACK_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        for (let i = 0; i < keysToRemove.length; i += 1) {
          sessionStorage.removeItem(keysToRemove[i]);
        }
      } catch {
      }
    }

    const db = await this.openDatabase();
    if (!db) return;

    await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  static getTreeKey(owner, repo, branch) {
    return 'github-scrap:cache:tree:' + owner + '/' + repo + '@' + branch;
  }

  static getBranchesKey(owner, repo) {
    return 'github-scrap:cache:branches:' + owner + '/' + repo;
  }

  static getRepoKey(owner, repo) {
    return 'github-scrap:cache:repo:' + owner + '/' + repo;
  }

  static async getTree(owner, repo, branch, options = {}) {
    return this.get(this.getTreeKey(owner, repo, branch), options);
  }

  static async setTree(owner, repo, branch, data, options = {}) {
    return this.set(this.getTreeKey(owner, repo, branch), data, options);
  }

  static async getBranches(owner, repo, options = {}) {
    return this.get(this.getBranchesKey(owner, repo), options);
  }

  static async setBranches(owner, repo, data, options = {}) {
    return this.set(this.getBranchesKey(owner, repo), data, options);
  }
}
