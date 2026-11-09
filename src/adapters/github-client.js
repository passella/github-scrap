import { TRANSLATIONS } from './i18n.js';
import { StorageAdapter } from './storage-adapter.js';
import { TreeCacheAdapter } from './tree-cache-adapter.js';

export function decodeBase64ToUint8Array(base64Str) {
  if (!base64Str || typeof base64Str !== 'string') {
    return new Uint8Array(0);
  }
  const clean = base64Str.replace(/\s+/g, '');
  if (typeof atob !== 'undefined') {
    const binaryStr = atob(clean);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(clean, 'base64'));
  }
  return new Uint8Array(0);
}

export class GitHubClient {
  static lastRateLimit = null;
  static rateLimitListeners = new Set();

  static onRateLimitChange(listener) {
    this.rateLimitListeners.add(listener);
    if (this.lastRateLimit) {
      listener(this.lastRateLimit);
    }
    return () => this.rateLimitListeners.delete(listener);
  }

  static notifyRateLimitChange(rateLimit, { fromSync = false } = {}) {
    this.lastRateLimit = rateLimit;
    if (!fromSync && rateLimit) {
      StorageAdapter.setLastRateLimit(rateLimit, { broadcast: true });
    }
    for (const listener of this.rateLimitListeners) {
      try {
        listener(rateLimit);
      } catch {
      }
    }
  }

  static getAuthHeaders() {
    const headers = {
      Accept: 'application/vnd.github+json',
    };
    const token = StorageAdapter.getGitHubToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    return headers;
  }

  static getSessionCache(key) {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static setSessionCache(key, data) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch {
    }
  }

  static parseRateLimit(response, lang = 'en') {
    const limit = response.headers.get('x-ratelimit-limit');
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    if (!limit && !remaining) return null;

    const locale = (TRANSLATIONS[lang] && TRANSLATIONS[lang].locale) || 'en-US';
    let resetFormatted = 'N/A';
    if (reset) {
      const resetTime = Number(reset) * 1000;
      if (!Number.isNaN(resetTime)) {
        resetFormatted = new Date(resetTime).toLocaleTimeString(locale);
      }
    }

    const scopesHeader = response.headers ? (response.headers.get('x-oauth-scopes') || response.headers.get('X-OAuth-Scopes')) : null;
    const scopes = scopesHeader ? scopesHeader.split(',').map((s) => s.trim()).filter(Boolean).join(', ') : null;

    const expirationHeader = response.headers ? (response.headers.get('github-authentication-token-expiration') || response.headers.get('GitHub-Authentication-Token-Expiration')) : null;
    let daysUntilExpiration = null;
    let expiresAtFormatted = null;
    if (expirationHeader) {
      const expDate = new Date(expirationHeader);
      if (!Number.isNaN(expDate.getTime())) {
        const diffMs = expDate.getTime() - Date.now();
        daysUntilExpiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        expiresAtFormatted = expDate.toLocaleDateString(locale);
      }
    }

    const parsed = {
      limit: limit || '60',
      remaining: remaining || '0',
      resetFormatted: resetFormatted,
      scopes: scopes,
      expiresAt: expirationHeader || null,
      expiresAtFormatted: expiresAtFormatted,
      daysUntilExpiration: daysUntilExpiration,
      isExpiringSoon: typeof daysUntilExpiration === 'number' && daysUntilExpiration <= 7 && daysUntilExpiration > 0,
    };

    this.notifyRateLimitChange(parsed);
    return parsed;
  }

  static async fetchRepoDetails(owner, repo, signal, lang = 'en') {
    const i18n = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    const cacheKey = 'github-scrap:cache:repo:' + owner + '/' + repo;
    const cachedData = this.getSessionCache(cacheKey);
    if (cachedData) {
      return {
        ok: true,
        data: cachedData,
        endpoint: 'Cache (sessionStorage)',
        rateLimit: this.lastRateLimit,
      };
    }

    const idbCached = await TreeCacheAdapter.get(cacheKey, { allowExpired: false });
    if (idbCached && idbCached.data) {
      this.setSessionCache(cacheKey, idbCached.data);
      return {
        ok: true,
        data: idbCached.data,
        endpoint: 'Cache (IndexedDB)',
        rateLimit: this.lastRateLimit,
      };
    }

    const endpoint = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
    let response = null;

    try {
      response = await fetch(endpoint, {
        headers: this.getAuthHeaders(),
        signal,
      });
    } catch (networkError) {
      if (networkError.name === 'AbortError') throw networkError;
      const offlineSnapshot = await TreeCacheAdapter.get(cacheKey, { allowExpired: true });
      if (offlineSnapshot && offlineSnapshot.data) {
        return {
          ok: true,
          data: offlineSnapshot.data,
          endpoint: 'Offline Cache (IndexedDB)',
          rateLimit: this.lastRateLimit,
          offlineFallback: true,
        };
      }
      return {
        ok: false,
        status: 'Network Failure / Offline',
        endpoint,
        apiMessage: networkError.message || 'Connection failure',
        rateLimit: null,
        friendlyMessage: i18n.errNetworkMsg,
      };
    }

    const rateLimit = this.parseRateLimit(response, lang);

    if (!response.ok) {
      let apiMessage = response.statusText;
      try {
        const body = await response.json();
        if (body && body.message) apiMessage = body.message;
      } catch {
      }

      let friendlyMessage = i18n.errGenericMetadata;
      if (response.status === 404) {
        friendlyMessage = i18n.errNotFoundMsg(owner, repo);
      } else if (response.status === 403 || response.status === 429) {
        friendlyMessage = i18n.errRateLimitMsg(rateLimit ? rateLimit.resetFormatted : 'soon', StorageAdapter.hasGitHubToken());
      }

      return {
        ok: false,
        status: response.status + ' ' + response.statusText,
        endpoint,
        apiMessage,
        rateLimit,
        friendlyMessage,
      };
    }

    const data = await response.json();
    this.setSessionCache(cacheKey, data);
    await TreeCacheAdapter.set(cacheKey, data);
    return {
      ok: true,
      data,
      endpoint,
      rateLimit,
    };
  }

  static async fetchBranches(owner, repo, signal, lang = 'en') {
    const i18n = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    const cacheKey = 'github-scrap:cache:branches:' + owner + '/' + repo;
    const cachedData = this.getSessionCache(cacheKey);
    if (cachedData) {
      return {
        ok: true,
        data: cachedData,
        endpoint: 'Cache (sessionStorage)',
        rateLimit: this.lastRateLimit,
      };
    }

    const idbCached = await TreeCacheAdapter.get(cacheKey, { allowExpired: false });
    if (idbCached && idbCached.data) {
      this.setSessionCache(cacheKey, idbCached.data);
      return {
        ok: true,
        data: idbCached.data,
        endpoint: 'Cache (IndexedDB)',
        rateLimit: this.lastRateLimit,
      };
    }

    const endpoint = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/branches?per_page=100';
    let response = null;

    try {
      response = await fetch(endpoint, {
        headers: this.getAuthHeaders(),
        signal,
      });
    } catch (networkError) {
      if (networkError.name === 'AbortError') throw networkError;
      const offlineSnapshot = await TreeCacheAdapter.get(cacheKey, { allowExpired: true });
      if (offlineSnapshot && Array.isArray(offlineSnapshot.data)) {
        return {
          ok: true,
          data: offlineSnapshot.data,
          endpoint: 'Offline Cache (IndexedDB)',
          rateLimit: this.lastRateLimit,
          offlineFallback: true,
        };
      }
      return {
        ok: false,
        status: 'Network Failure / Offline',
        endpoint,
        apiMessage: networkError.message || 'Connection failure',
        rateLimit: null,
        friendlyMessage: i18n.errNetworkMsg,
        data: [],
      };
    }

    const rateLimit = this.parseRateLimit(response, lang);

    if (!response.ok) {
      let apiMessage = response.statusText;
      try {
        const body = await response.json();
        if (body && body.message) apiMessage = body.message;
      } catch {
      }

      return {
        ok: false,
        status: response.status + ' ' + response.statusText,
        endpoint,
        apiMessage,
        rateLimit,
        friendlyMessage: i18n.errGenericMetadata,
        data: [],
      };
    }

    const data = await response.json();
    const branchesArray = Array.isArray(data) ? data : [];
    this.setSessionCache(cacheKey, branchesArray);
    await TreeCacheAdapter.set(cacheKey, branchesArray);
    return {
      ok: true,
      data: branchesArray,
      endpoint,
      rateLimit,
    };
  }

  static async fetchRepositoryBranches(owner, repo, signal, lang = 'en') {
    return this.fetchBranches(owner, repo, signal, lang);
  }

  static async fetchGitTrees(owner, repo, branch, signal, lang = 'en') {
    const i18n = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    const cacheKey = 'github-scrap:cache:tree:' + owner + '/' + repo + '@' + branch;
    const cachedData = this.getSessionCache(cacheKey);
    if (cachedData) {
      return {
        ok: true,
        data: cachedData,
        endpoint: 'Cache (sessionStorage)',
        rateLimit: this.lastRateLimit,
      };
    }

    const idbCached = await TreeCacheAdapter.get(cacheKey, { allowExpired: false });
    if (idbCached && idbCached.data) {
      this.setSessionCache(cacheKey, idbCached.data);
      return {
        ok: true,
        data: idbCached.data,
        endpoint: 'Cache (IndexedDB)',
        rateLimit: this.lastRateLimit,
      };
    }

    const encodedBranch = encodeURIComponent(branch);
    const endpoint = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/git/trees/' + encodedBranch + '?recursive=1';
    let response = null;

    try {
      response = await fetch(endpoint, {
        headers: this.getAuthHeaders(),
        signal,
      });
    } catch (networkError) {
      if (networkError.name === 'AbortError') throw networkError;
      const offlineSnapshot = await TreeCacheAdapter.get(cacheKey, { allowExpired: true });
      if (offlineSnapshot && offlineSnapshot.data) {
        return {
          ok: true,
          data: offlineSnapshot.data,
          endpoint: 'Offline Cache (IndexedDB)',
          rateLimit: this.lastRateLimit,
          offlineFallback: true,
        };
      }
      return {
        ok: false,
        status: 'Network Failure / Offline',
        endpoint,
        apiMessage: networkError.message || 'Connection failure',
        rateLimit: null,
        friendlyMessage: i18n.errTreeNetworkMsg,
      };
    }

    const rateLimit = this.parseRateLimit(response, lang);

    if (!response.ok) {
      let apiMessage = response.statusText;
      try {
        const body = await response.json();
        if (body && body.message) apiMessage = body.message;
      } catch {
      }

      let friendlyMessage = i18n.errGenericTree;
      if (response.status === 404) {
        friendlyMessage = i18n.errBranchNotFoundMsg(owner, repo, branch);
      } else if (response.status === 403 || response.status === 429) {
        friendlyMessage = i18n.errRateLimitMsg(rateLimit ? rateLimit.resetFormatted : 'soon', StorageAdapter.hasGitHubToken());
      }

      return {
        ok: false,
        status: response.status + ' ' + response.statusText,
        endpoint,
        apiMessage,
        rateLimit,
        friendlyMessage,
      };
    }

    const data = await response.json();
    this.setSessionCache(cacheKey, data);
    await TreeCacheAdapter.set(cacheKey, data);
    return {
      ok: true,
      data,
      endpoint,
      rateLimit,
    };
  }

  static async fetchRepositoryTree(owner, repo, branch, signal, lang = 'en') {
    return this.fetchGitTrees(owner, repo, branch, signal, lang);
  }

  static async downloadFileText(rawUrl, signal, blobFallback = null) {
    try {
      const response = await fetch(rawUrl, { signal });
      if (response.ok) {
        const text = await response.text();
        return {
          ok: true,
          status: response.status,
          statusText: response.statusText,
          content: text,
        };
      }

      if (blobFallback && blobFallback.sha && blobFallback.owner && blobFallback.repo) {
        const fallbackEndpoint = 'https://api.github.com/repos/' + encodeURIComponent(blobFallback.owner) + '/' + encodeURIComponent(blobFallback.repo) + '/git/blobs/' + encodeURIComponent(blobFallback.sha);
        const fbRes = await fetch(fallbackEndpoint, {
          headers: this.getAuthHeaders(),
          signal,
        });
        if (fbRes.ok) {
          const jsonBody = await fbRes.json();
          if (jsonBody && jsonBody.content && jsonBody.encoding === 'base64') {
            const bytes = decodeBase64ToUint8Array(jsonBody.content);
            const text = new TextDecoder('utf-8').decode(bytes);
            return {
              ok: true,
              status: fbRes.status,
              statusText: fbRes.statusText,
              content: text,
            };
          }
        }
      }

      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        content: null,
      };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      return {
        ok: false,
        status: 0,
        statusText: err.message || 'Connection error',
        content: null,
      };
    }
  }

  static async downloadFileBinary(rawUrl, signal, blobFallback = null) {
    try {
      const response = await fetch(rawUrl, { signal });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return {
          ok: true,
          status: response.status,
          statusText: response.statusText,
          content: new Uint8Array(arrayBuffer),
        };
      }

      if (blobFallback && blobFallback.sha && blobFallback.owner && blobFallback.repo) {
        const fallbackEndpoint = 'https://api.github.com/repos/' + encodeURIComponent(blobFallback.owner) + '/' + encodeURIComponent(blobFallback.repo) + '/git/blobs/' + encodeURIComponent(blobFallback.sha);
        const fbRes = await fetch(fallbackEndpoint, {
          headers: this.getAuthHeaders(),
          signal,
        });
        if (fbRes.ok) {
          const jsonBody = await fbRes.json();
          if (jsonBody && jsonBody.content && jsonBody.encoding === 'base64') {
            const bytes = decodeBase64ToUint8Array(jsonBody.content);
            return {
              ok: true,
              status: fbRes.status,
              statusText: fbRes.statusText,
              content: bytes,
            };
          }
        }
      }

      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        content: null,
      };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      return {
        ok: false,
        status: 0,
        statusText: err.message || 'Connection error',
        content: null,
      };
    }
  }

  static async fetchMultipleFiles(filesWithUrls, { concurrency = 6, signal, onProgress, binary = false } = {}) {
    const totalFiles = filesWithUrls.length;
    let totalBytes = 0;
    for (let i = 0; i < totalFiles; i += 1) {
      totalBytes += filesWithUrls[i].size || 0;
    }

    let completedFiles = 0;
    let completedBytes = 0;
    let pointer = 0;
    const results = new Array(totalFiles);

    if (typeof onProgress === 'function') {
      onProgress({ completedFiles: 0, totalFiles, completedBytes: 0, totalBytes, currentPath: '' });
    }

    const worker = async () => {
      while (pointer < filesWithUrls.length) {
        if (signal && signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const index = pointer;
        pointer += 1;
        const item = filesWithUrls[index];

        if (typeof onProgress === 'function') {
          onProgress({ completedFiles, totalFiles, completedBytes, totalBytes, currentPath: item.path });
        }

        const res = binary
          ? await this.downloadFileBinary(item.rawUrl, signal, item.blobFallback)
          : await this.downloadFileText(item.rawUrl, signal, item.blobFallback);

        results[index] = { item, res };
        completedFiles += 1;
        completedBytes += item.size || 0;

        if (typeof onProgress === 'function') {
          onProgress({ completedFiles, totalFiles, completedBytes, totalBytes, currentPath: item.path });
        }
      }
    };

    const workers = [];
    const poolSize = Math.min(concurrency, totalFiles);
    for (let w = 0; w < poolSize; w += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return results;
  }

  static async validateGithubToken(token, options = {}) {
    return validateGithubToken(token, options);
  }
}

export function isValidGitHubTokenSyntax(token) {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^gh[pous]_[A-Za-z0-9_]{8,}$/.test(trimmed)) return true;
  if (/^github_pat_[A-Za-z0-9_]{10,}$/.test(trimmed)) return true;
  if (/^[a-f0-9]{40}$/i.test(trimmed)) return true;
  return false;
}

export async function validateGithubToken(token, { signal, lang = 'en', onRateLimit = null } = {}) {
  const i18n = TRANSLATIONS[lang] || TRANSLATIONS['en'];
  if (!token || typeof token !== 'string' || !token.trim()) {
    return {
      valid: false,
      status: 0,
      username: null,
      rateLimit: null,
      scopes: null,
      message: i18n.tokenErrorEmpty,
    };
  }

  const cleanToken = token.trim();
  if (!isValidGitHubTokenSyntax(cleanToken)) {
    return {
      valid: false,
      status: 0,
      username: null,
      rateLimit: null,
      scopes: null,
      message: i18n.tokenErrorFormat,
    };
  }

  const endpoint = 'https://api.github.com/user';
  let response = null;

  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + cleanToken,
      },
      signal,
    });
  } catch (networkError) {
    if (networkError.name === 'AbortError') throw networkError;
    return {
      valid: false,
      status: 0,
      username: null,
      rateLimit: null,
      scopes: null,
      message: networkError.message || i18n.errNetworkMsg,
    };
  }

  const rateLimit = GitHubClient.parseRateLimit(response, lang);
  if (rateLimit && typeof onRateLimit === 'function') {
    try {
      onRateLimit(rateLimit);
    } catch {
    }
  }

  const scopes = rateLimit ? rateLimit.scopes : null;
  const expiresAt = rateLimit ? rateLimit.expiresAt : null;
  const expiresAtFormatted = rateLimit ? rateLimit.expiresAtFormatted : null;
  const daysUntilExpiration = rateLimit ? rateLimit.daysUntilExpiration : null;
  const isExpiringSoon = rateLimit ? rateLimit.isExpiringSoon : false;

  if (response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    const username = data && data.login ? data.login : null;
    return {
      valid: true,
      status: response.status,
      username,
      rateLimit,
      scopes,
      expiresAt,
      expiresAtFormatted,
      daysUntilExpiration,
      isExpiringSoon,
      message: null,
    };
  }

  let isBadCredentials = false;
  try {
    const errorBody = await response.json();
    if (errorBody && errorBody.message && errorBody.message.toLowerCase().includes('bad credentials')) {
      isBadCredentials = true;
    }
  } catch {
  }

  if (response.status === 401 || isBadCredentials) {
    return {
      valid: false,
      status: 401,
      username: null,
      rateLimit,
      scopes: null,
      message: i18n.tokenErrorInvalid,
    };
  }

  if (response.status === 403) {
    try {
      const rlResponse = await fetch('https://api.github.com/rate_limit', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + cleanToken,
        },
        signal,
      });
      if (rlResponse.ok) {
        const rlData = await rlResponse.json();
        const rlParsed = GitHubClient.parseRateLimit(rlResponse, lang);
        if (rlParsed && typeof onRateLimit === 'function') {
          try {
            onRateLimit(rlParsed);
          } catch {
          }
        }
        const limitNum = Number((rlData && rlData.rate && rlData.rate.limit) || (rlParsed && rlParsed.limit) || 0);
        if (limitNum > 60) {
          return {
            valid: true,
            status: 200,
            username: null,
            rateLimit: rlParsed,
            scopes: rlParsed ? rlParsed.scopes : null,
            message: null,
          };
        }
      }
    } catch (rlErr) {
      if (rlErr.name === 'AbortError') throw rlErr;
    }
    return {
      valid: false,
      status: 403,
      username: null,
      rateLimit,
      scopes: null,
      message: i18n.tokenErrorInvalid,
    };
  }

  return {
    valid: false,
    status: response.status,
    username: null,
    rateLimit,
    scopes: null,
    message: i18n.tokenErrorGeneric,
  };
}

export const GitHubHttpAdapter = GitHubClient;
