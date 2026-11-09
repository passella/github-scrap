import { ZipEncoder } from './zip-encoder.js';
import { TextFormatter } from '../domain/text-formatter.js';

const isWorkerContext =
  typeof self !== 'undefined' &&
  typeof window === 'undefined' &&
  typeof self.postMessage === 'function' &&
  typeof self.addEventListener === 'function';

if (isWorkerContext) {
  self.addEventListener('message', async (event) => {
    const payload = event && event.data ? event.data : null;
    if (!payload || !payload.id) return;

    const { id, action } = payload;

    try {
      if (action === 'encode-zip') {
        const zipBytes = await ZipEncoder.encode(payload.entries || []);
        self.postMessage(
          { id, ok: true, zipBytes },
          [zipBytes.buffer]
        );
      } else if (action === 'format-text') {
        const text = TextFormatter.buildOutputDocument(
          payload.results || [],
          payload.lang || 'en',
          null
        );
        self.postMessage({ id, ok: true, text });
      } else {
        self.postMessage({ id, ok: false, error: 'Unsupported worker action: ' + String(action) });
      }
    } catch (err) {
      self.postMessage({
        id,
        ok: false,
        error: err && err.message ? err.message : 'Worker execution failure',
      });
    }
  });
}

export class ExportWorkerClient {
  static workerInstance = null;
  static pendingRequests = new Map();
  static requestCounter = 0;

  static getWorker() {
    if (this.workerInstance) {
      return this.workerInstance;
    }
    if (typeof Worker !== 'function') {
      return null;
    }
    try {
      const worker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const data = event && event.data ? event.data : null;
        if (!data || !data.id) return;
        const pending = this.pendingRequests.get(data.id);
        if (!pending) return;
        this.pendingRequests.delete(data.id);
        if (data.ok) {
          pending.resolve(data);
        } else {
          pending.reject(new Error(data.error || 'Worker task error'));
        }
      };
      worker.onerror = () => {
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Worker runtime error'));
        }
        this.pendingRequests.clear();
        this.workerInstance = null;
      };
      this.workerInstance = worker;
      return worker;
    } catch {
      this.workerInstance = null;
      return null;
    }
  }

  static dispatchTask(action, payload, transferList = []) {
    const worker = this.getWorker();
    if (!worker) {
      return Promise.reject(new Error('Worker unavailable'));
    }
    this.requestCounter += 1;
    const id = 'task_' + Date.now() + '_' + this.requestCounter;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, action, ...payload }, transferList);
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  static async formatText(results, lang = 'en', i18n = null) {
    if (typeof Worker === 'function') {
      try {
        const res = await this.dispatchTask('format-text', { results, lang });
        if (res && typeof res.text === 'string') {
          return res.text;
        }
      } catch {
      }
    }
    return TextFormatter.buildOutputDocument(results, lang, i18n);
  }

  static async encodeZip(entries) {
    if (typeof Worker === 'function') {
      try {
        const res = await this.dispatchTask('encode-zip', { entries });
        if (res && res.zipBytes) {
          return res.zipBytes instanceof Uint8Array ? res.zipBytes : new Uint8Array(res.zipBytes);
        }
      } catch {
      }
    }
    return ZipEncoder.encode(entries);
  }

  static terminate() {
    if (this.workerInstance) {
      try {
        this.workerInstance.terminate();
      } catch {
      }
      this.workerInstance = null;
    }
    this.pendingRequests.clear();
  }
}
