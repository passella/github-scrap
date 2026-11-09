import { TreeCacheAdapter } from './tree-cache-adapter.js';

export { TreeCacheAdapter };

const STORAGE_KEY = 'github-scrap:last-repo-url';
const REPO_PREFS_PREFIX = 'github-scrap:repo-preferences:';
const TOKEN_KEY = 'github-scrap:github-token';
const TOKEN_USER_KEY = 'github-scrap:github-token-user';
const TOKEN_PROFILES_KEY = 'github-scrap:token-profiles';
const LAST_RATE_LIMIT_KEY = 'github-scrap:last-rate-limit';
const SYNC_CHANNEL_NAME = 'github-scrap:sync';

export class StorageAdapter {
  static syncChannel = null;
  static syncListeners = new Set();

  static initSyncChannel() {
    if (this.syncChannel || typeof BroadcastChannel !== 'function') {
      return this.syncChannel;
    }
    try {
      this.syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      if (typeof this.syncChannel.unref === 'function') {
        this.syncChannel.unref();
      }
      this.syncChannel.onmessage = (event) => {
        const data = event && event.data ? event.data : null;
        if (!data || !data.type) return;
        this.notifySyncListeners(data);
      };
    } catch {
      this.syncChannel = null;
    }
    return this.syncChannel;
  }

  static onSync(listener) {
    if (typeof listener !== 'function') return () => {};
    this.initSyncChannel();
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  static notifySyncListeners(message) {
    for (const listener of this.syncListeners) {
      try {
        listener(message);
      } catch {
      }
    }
  }

  static broadcastSync(type, payload = {}) {
    const ch = this.initSyncChannel();
    const message = {
      type,
      ...payload,
      timestamp: Date.now(),
    };
    if (ch && typeof ch.postMessage === 'function') {
      try {
        ch.postMessage(message);
      } catch {
      }
    }
  }

  static getLastRateLimit() {
    try {
      const raw = localStorage.getItem(LAST_RATE_LIMIT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static setLastRateLimit(rateLimit, { broadcast = true } = {}) {
    if (!rateLimit) return;
    try {
      localStorage.setItem(LAST_RATE_LIMIT_KEY, JSON.stringify(rateLimit));
    } catch {
    }
    if (broadcast) {
      this.broadcastSync('rate-limit-changed', { rateLimit });
    }
  }

  static getStoredRepoUrl() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  static setStoredRepoUrl(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
    }
  }

  static getGitHubToken() {
    try {
      const active = this.getActiveProfile();
      if (active && active.token) return active.token;
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  static setGitHubToken(token) {
    try {
      if (token && typeof token === 'string' && token.trim()) {
        const cleanToken = token.trim();
        localStorage.setItem(TOKEN_KEY, cleanToken);
        const username = this.getGitHubUsername();
        this.saveTokenProfile({
          label: username ? '@' + username : 'Padrão',
          username: username || '',
          token: cleanToken,
          scopes: '',
        });
      } else {
        this.removeGitHubToken();
      }
    } catch {
    }
  }

  static getGitHubUsername() {
    try {
      const active = this.getActiveProfile();
      if (active && active.username) return active.username;
      return localStorage.getItem(TOKEN_USER_KEY) || '';
    } catch {
      return '';
    }
  }

  static setGitHubUsername(username) {
    try {
      if (username && typeof username === 'string' && username.trim()) {
        const cleanUser = username.trim();
        localStorage.setItem(TOKEN_USER_KEY, cleanUser);
        const active = this.getActiveProfile();
        if (active) {
          active.username = cleanUser;
          if (!active.label || active.label === 'Padrão' || active.label.startsWith('@')) {
            active.label = '@' + cleanUser;
          }
          this.updateTokenProfile(active);
        }
      } else {
        localStorage.removeItem(TOKEN_USER_KEY);
      }
    } catch {
    }
  }

  static removeGitHubToken({ broadcast = true } = {}) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_USER_KEY);
      localStorage.removeItem(TOKEN_PROFILES_KEY);
    } catch {
    }
    if (broadcast) {
      this.broadcastSync('token-profiles-changed', { action: 'removed' });
    }
  }

  static hasGitHubToken() {
    return Boolean(this.getGitHubToken());
  }

  static getTokenProfiles() {
    try {
      const raw = localStorage.getItem(TOKEN_PROFILES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      const legacyToken = localStorage.getItem(TOKEN_KEY);
      if (legacyToken && legacyToken.trim()) {
        const legacyUser = localStorage.getItem(TOKEN_USER_KEY) || '';
        const profile = {
          id: 'profile_' + Date.now(),
          label: legacyUser ? '@' + legacyUser : 'Padrão',
          username: legacyUser,
          token: legacyToken.trim(),
          scopes: '',
          updatedAt: new Date().toISOString(),
          active: true,
        };
        localStorage.setItem(TOKEN_PROFILES_KEY, JSON.stringify([profile]));
        return [profile];
      }
      return [];
    } catch {
      return [];
    }
  }

  static saveTokenProfiles(profiles, { broadcast = true } = {}) {
    try {
      localStorage.setItem(TOKEN_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
    }
    if (broadcast) {
      this.broadcastSync('token-profiles-changed', { count: Array.isArray(profiles) ? profiles.length : 0 });
    }
  }

  static getActiveProfile() {
    const profiles = this.getTokenProfiles();
    if (!profiles || profiles.length === 0) return null;
    const active = profiles.find((p) => p.active);
    return active || profiles[0];
  }

  static saveTokenProfile({ label, username, token, scopes, status = 'valid', expiresAt = null, expiresAtFormatted = null, lastVerifiedAt = null }) {
    if (!token || typeof token !== 'string' || !token.trim()) return null;
    const cleanToken = token.trim();
    const cleanUser = username ? username.trim() : '';
    const cleanLabel = label && label.trim() ? label.trim() : (cleanUser ? '@' + cleanUser : 'Padrão');
    const cleanScopes = scopes ? scopes.trim() : '';
    const verifiedTimestamp = lastVerifiedAt || new Date().toISOString();

    const profiles = this.getTokenProfiles();
    let existing = profiles.find((p) => p.token === cleanToken);

    for (let i = 0; i < profiles.length; i += 1) {
      profiles[i].active = false;
    }

    if (existing) {
      existing.label = cleanLabel;
      existing.username = cleanUser || existing.username;
      existing.scopes = cleanScopes || existing.scopes;
      existing.status = status;
      if (expiresAt) existing.expiresAt = expiresAt;
      if (expiresAtFormatted) existing.expiresAtFormatted = expiresAtFormatted;
      existing.lastVerifiedAt = verifiedTimestamp;
      existing.updatedAt = new Date().toISOString();
      existing.active = true;
    } else {
      existing = {
        id: 'profile_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        label: cleanLabel,
        username: cleanUser,
        token: cleanToken,
        scopes: cleanScopes,
        status: status,
        expiresAt: expiresAt || null,
        expiresAtFormatted: expiresAtFormatted || null,
        lastVerifiedAt: verifiedTimestamp,
        updatedAt: new Date().toISOString(),
        active: true,
      };
      profiles.push(existing);
    }

    this.saveTokenProfiles(profiles);
    try {
      localStorage.setItem(TOKEN_KEY, cleanToken);
      if (cleanUser) {
        localStorage.setItem(TOKEN_USER_KEY, cleanUser);
      } else {
        localStorage.removeItem(TOKEN_USER_KEY);
      }
    } catch {
    }

    return existing;
  }

  static updateProfileStatus(profileId, updates = {}) {
    if (!profileId) return null;
    const profiles = this.getTokenProfiles();
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return null;
    if (updates.status) target.status = updates.status;
    if (updates.lastVerifiedAt) target.lastVerifiedAt = updates.lastVerifiedAt;
    if (updates.expiresAt !== undefined) target.expiresAt = updates.expiresAt;
    if (updates.expiresAtFormatted !== undefined) target.expiresAtFormatted = updates.expiresAtFormatted;
    target.updatedAt = new Date().toISOString();
    this.saveTokenProfiles(profiles);
    return target;
  }

  static importProfiles(importedProfiles) {
    if (!Array.isArray(importedProfiles)) return 0;
    const profiles = this.getTokenProfiles();
    let importedCount = 0;
    for (let i = 0; i < importedProfiles.length; i += 1) {
      const item = importedProfiles[i];
      if (!item || !item.token || typeof item.token !== 'string') continue;
      const cleanToken = item.token.trim();
      let existing = profiles.find((p) => p.token === cleanToken);
      if (existing) {
        if (item.label) existing.label = item.label;
        if (item.username) existing.username = item.username;
        if (item.scopes) existing.scopes = item.scopes;
        if (item.status) existing.status = item.status;
        if (item.expiresAt) existing.expiresAt = item.expiresAt;
        if (item.expiresAtFormatted) existing.expiresAtFormatted = item.expiresAtFormatted;
        if (item.lastVerifiedAt) existing.lastVerifiedAt = item.lastVerifiedAt;
        existing.updatedAt = new Date().toISOString();
      } else {
        profiles.push({
          id: item.id || ('profile_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
          label: item.label || (item.username ? '@' + item.username : 'Importado'),
          username: item.username || '',
          token: cleanToken,
          scopes: item.scopes || '',
          status: item.status || 'unverified',
          expiresAt: item.expiresAt || null,
          expiresAtFormatted: item.expiresAtFormatted || null,
          lastVerifiedAt: item.lastVerifiedAt || null,
          updatedAt: new Date().toISOString(),
          active: false,
        });
      }
      importedCount += 1;
    }

    if (profiles.length > 0 && !profiles.some((p) => p.active)) {
      profiles[0].active = true;
      try {
        localStorage.setItem(TOKEN_KEY, profiles[0].token);
        if (profiles[0].username) {
          localStorage.setItem(TOKEN_USER_KEY, profiles[0].username);
        }
      } catch {
      }
    }

    this.saveTokenProfiles(profiles);
    return importedCount;
  }

  static updateTokenProfile(profile) {
    if (!profile || !profile.id) return;
    const profiles = this.getTokenProfiles();
    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx !== -1) {
      profiles[idx] = { ...profiles[idx], ...profile };
      this.saveTokenProfiles(profiles);
    }
  }

  static setActiveTokenProfile(profileId) {
    const profiles = this.getTokenProfiles();
    let activeProfile = null;
    for (let i = 0; i < profiles.length; i += 1) {
      if (profiles[i].id === profileId) {
        profiles[i].active = true;
        activeProfile = profiles[i];
      } else {
        profiles[i].active = false;
      }
    }

    if (activeProfile) {
      this.saveTokenProfiles(profiles);
      try {
        localStorage.setItem(TOKEN_KEY, activeProfile.token);
        if (activeProfile.username) {
          localStorage.setItem(TOKEN_USER_KEY, activeProfile.username);
        } else {
          localStorage.removeItem(TOKEN_USER_KEY);
        }
      } catch {
      }
    }
    return activeProfile;
  }

  static deleteTokenProfile(profileId) {
    const profiles = this.getTokenProfiles();
    const toDelete = profiles.find((p) => p.id === profileId);
    if (!toDelete) return null;

    const remaining = profiles.filter((p) => p.id !== profileId);
    if (toDelete.active) {
      if (remaining.length > 0) {
        remaining[0].active = true;
        this.saveTokenProfiles(remaining);
        try {
          localStorage.setItem(TOKEN_KEY, remaining[0].token);
          if (remaining[0].username) {
            localStorage.setItem(TOKEN_USER_KEY, remaining[0].username);
          } else {
            localStorage.removeItem(TOKEN_USER_KEY);
          }
        } catch {
        }
      } else {
        this.saveTokenProfiles([]);
        try {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(TOKEN_USER_KEY);
        } catch {
        }
      }
    } else {
      this.saveTokenProfiles(remaining);
    }
    return toDelete;
  }

  static getRepoPreferences(owner, repo, branch) {
    try {
      const key = REPO_PREFS_PREFIX + owner + '/' + repo + '@' + branch;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static saveRepoPreferences(owner, repo, branch, preferences) {
    try {
      const key = REPO_PREFS_PREFIX + owner + '/' + repo + '@' + branch;
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {
    }
  }

  static clearRepoPreferences(owner, repo, branch) {
    try {
      const key = REPO_PREFS_PREFIX + owner + '/' + repo + '@' + branch;
      localStorage.removeItem(key);
    } catch {
    }
  }
}

export const LocalStorageAdapter = StorageAdapter;
