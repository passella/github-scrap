import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomController } from '../src/adapters/dom-controller.js';
import { ExportWorkerClient } from '../src/adapters/export-worker.js';
import { GitHubClient } from '../src/adapters/github-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(cls) {
    this.classes.add(cls);
  }
  remove(cls) {
    this.classes.delete(cls);
  }
  contains(cls) {
    return this.classes.has(cls);
  }
}

class MockElement {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    this.style = {};
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.children = [];
    this.dataset = {};
  }
  setAttribute(name, val) {
    this.attributes.set(name, String(val));
  }
  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }
  dispatchEvent(event) {
    const list = this.eventListeners.get(event.type) || [];
    for (const fn of list) {
      fn(event);
    }
  }
  focus() {}
  select() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.dispatchEvent({ type: 'close' });
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
  appendChild(node) {
    this.children.push(node);
    return node;
  }
  closest() {
    return null;
  }
}

function createMockEnvironment() {
  const body = new MockElement('body');
  const doc = {
    body,
    createElement: (tag) => new MockElement(tag),
    querySelector: (selector) => {
      if (selector === '#token-dialog') return elements.tokenDialog;
      if (selector === '#preview-dialog') return elements.previewDialog;
      if (selector === '#progress-bar-fill') return elements.generationProgressBarFill;
      if (selector === '#progress-status-text') return elements.progressStatusText;
      if (selector === '#extension-chips-bar') return elements.extensionChipsBar;
      return null;
    },
  };

  const elements = {
    tokenDialog: new MockElement('dialog', 'token-dialog'),
    tokenInput: new MockElement('input', 'token-input'),
    tokenButton: new MockElement('button', 'token-button'),
    tokenSaveBtn: new MockElement('button', 'token-save-btn'),
    tokenRemoveBtn: new MockElement('button', 'token-remove-btn'),
    tokenCloseBtn: new MockElement('button', 'token-close-btn'),
    tokenCloseIconBtn: new MockElement('button', 'token-close-icon-btn'),
    previewDialog: new MockElement('dialog', 'preview-dialog'),
    previewTextarea: new MockElement('textarea', 'preview-textarea'),
    previewTitle: new MockElement('h2', 'preview-title'),
    previewSizeBadge: new MockElement('span', 'preview-size-badge'),
    copyPreviewBtn: new MockElement('button', 'copy-preview-button'),
    openTabPreviewBtn: new MockElement('button', 'open-tab-preview-button'),
    closePreviewBtn: new MockElement('button', 'close-preview-button'),
    generationProgressContainer: new MockElement('div', 'generation-progress-container'),
    generationProgressbar: new MockElement('div', 'generation-progressbar'),
    generationProgressBarFill: new MockElement('div', 'progress-bar-fill'),
    progressStatusText: new MockElement('span', 'progress-status-text'),
    generateButton: new MockElement('button', 'generate-button'),
    generateZipButton: new MockElement('button', 'generate-zip-button'),
    previewButton: new MockElement('button', 'preview-button'),
    extensionChipsBar: new MockElement('div', 'extension-chips-bar'),
    fileList: new MockElement('ul', 'file-list'),
    fileFilterInput: new MockElement('input', 'file-filter-input'),
    selectAllCheckbox: new MockElement('input', 'select-all-checkbox'),
    masterModeToggle: new MockElement('button', 'master-mode-toggle'),
    resultsSection: new MockElement('section', 'results-section'),
  };

  elements.generationProgressContainer.hidden = true;

  globalThis.document = doc;
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return { doc, elements };
}

test('CSS rules prevent background scrolling and scroll chaining with modern top-layer transitions', () => {
  const cssPath = path.join(projectRoot, 'style.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(cssContent.includes('body.modal-open'));
  assert.ok(cssContent.includes('overflow: hidden;'));
  assert.ok(cssContent.includes('overscroll-behavior: contain;'));
  assert.ok(cssContent.includes('@starting-style'));
  assert.ok(cssContent.includes('allow-discrete'));
  assert.ok(cssContent.includes('scale(0.96)'));
  assert.ok(cssContent.includes('.generation-progress-container[hidden]'));
  assert.ok(cssContent.includes('transition: width 0.15s ease'));
  assert.ok(!cssContent.includes('transform: scaleX(0);'));
});

test('DomController locks body scroll when opening modals and restores on close', () => {
  const { doc, elements } = createMockEnvironment();
  const controller = new DomController(elements);
  controller.init();

  assert.equal(doc.body.classList.contains('modal-open'), false);

  controller.openPreviewDialog('test.txt', '10 KB', 'content');
  assert.equal(doc.body.classList.contains('modal-open'), true);

  controller.closePreviewDialog();
  assert.equal(doc.body.classList.contains('modal-open'), false);

  controller.openTokenDialog();
  assert.equal(doc.body.classList.contains('modal-open'), true);

  elements.tokenDialog.close();
  assert.equal(doc.body.classList.contains('modal-open'), false);
});

test('DomController updates progress bar width and hides/cleans footer on finish with byte weighting', () => {
  const { elements } = createMockEnvironment();
  const controller = new DomController(elements);

  controller.showProgress(0, 100, 'src/index.js');
  assert.equal(elements.generationProgressContainer.hidden, false);
  assert.equal(elements.generationProgressBarFill.style.width, '0%');
  assert.ok(elements.progressStatusText.textContent.includes('0% (0/100)'));

  controller.updateProgress(45, 100, 'src/domain/repo-parser.js');
  assert.equal(elements.generationProgressBarFill.style.width, '45%');
  assert.equal(elements.generationProgressBarFill.style.inlineSize, '45%');
  assert.equal(elements.generationProgressbar.getAttribute('aria-valuenow'), '45');
  assert.ok(elements.progressStatusText.textContent.includes('45% (45/100)'));

  controller.updateProgress(10, 20, 'large-file.bin', 1048576, 10485760);
  assert.equal(elements.generationProgressBarFill.style.width, '10%');
  assert.equal(elements.generationProgressbar.getAttribute('aria-valuenow'), '10');
  assert.ok(elements.progressStatusText.textContent.includes('10% (10/20 • 1 MB / 10 MB)'));

  controller.updateProgress(100, 100, 'done');
  assert.equal(elements.generationProgressBarFill.style.width, '100%');

  controller.hideProgress();
  assert.equal(elements.generationProgressContainer.hidden, true);
  assert.equal(elements.generationProgressContainer.style.display, 'none');
  assert.equal(elements.generationProgressBarFill.style.width, '0%');
  assert.equal(elements.progressStatusText.textContent, '');
});

test('DomController handles global keyboard shortcuts Ctrl+Shift+S, Ctrl+Shift+Z, Ctrl+Shift+P', () => {
  const { elements } = createMockEnvironment();
  const controller = new DomController(elements);

  let generateClicked = false;
  let zipClicked = false;
  let previewClicked = false;

  controller.handleGenerateClick = () => { generateClicked = true; };
  controller.handleGenerateZipClick = () => { zipClicked = true; };
  controller.handlePreviewClick = () => { previewClicked = true; };

  elements.generateButton.disabled = false;
  elements.generateZipButton.disabled = false;
  elements.previewButton.disabled = false;

  controller.handleGlobalKeyDown({
    ctrlKey: true,
    shiftKey: true,
    key: 'S',
    preventDefault: () => {},
  });
  assert.equal(generateClicked, true);

  controller.handleGlobalKeyDown({
    ctrlKey: true,
    shiftKey: true,
    key: 'Z',
    preventDefault: () => {},
  });
  assert.equal(zipClicked, true);

  controller.handleGlobalKeyDown({
    ctrlKey: true,
    shiftKey: true,
    key: 'P',
    preventDefault: () => {},
  });
  assert.equal(previewClicked, true);
});

test('ExportWorkerClient transparent in-thread fallback formats text and encodes zip', async () => {
  const sampleResults = [
    { mode: 'text', path: 'src/main.js', content: 'console.log("ok");' },
    { mode: 'reference', path: 'package-lock.json', type: 'JSON', sizeFormatted: '12 KB', blobUrl: 'https://github.com', rawUrl: 'https://raw.github.com' }
  ];

  const formatted = await ExportWorkerClient.formatText(sampleResults, 'en');
  assert.ok(typeof formatted === 'string');
  assert.ok(formatted.includes('src/main.js'));
  assert.ok(formatted.includes('package-lock.json'));

  const zipEntries = [
    { path: 'test.txt', data: new TextEncoder().encode('Hello World') }
  ];
  const zipBytes = await ExportWorkerClient.encodeZip(zipEntries);
  assert.ok(zipBytes instanceof Uint8Array);
  assert.ok(zipBytes.length > 22);
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
});

test('Extension chips: renders chips and toggles group selection', () => {
  const { elements } = createMockEnvironment();
  const controller = new DomController(elements);
  controller.currentRepoContext = {
    owner: 'testowner',
    repo: 'testrepo',
    branch: 'main',
    files: [
      { path: 'file1.js', size: 100 },
      { path: 'file2.js', size: 200 },
      { path: 'style.css', size: 300 }
    ],
    selectedFlags: new Uint8Array([1, 1, 1]),
    modeFlags: new Uint8Array([0, 0, 0]),
    selectedCount: 3,
  };
  controller.renderExtensionChips();
  assert.ok(elements.extensionChipsBar.children.length > 0);
  controller.toggleExtensionSelection('.js');
  assert.equal(controller.currentRepoContext.selectedFlags[0], 0);
  assert.equal(controller.currentRepoContext.selectedFlags[1], 0);
  assert.equal(controller.currentRepoContext.selectedFlags[2], 1);
});

test('GitHubClient.fetchMultipleFiles computes byte weighted progress', async () => {
  const originalDownload = GitHubClient.downloadFileText;
  GitHubClient.downloadFileText = async (url) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    content: 'mock content from ' + url,
  });

  const progressUpdates = [];
  const files = [
    { path: 'a.js', rawUrl: 'https://example.com/a.js', size: 1000 },
    { path: 'b.js', rawUrl: 'https://example.com/b.js', size: 4000 }
  ];

  try {
    const results = await GitHubClient.fetchMultipleFiles(files, {
      concurrency: 2,
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    assert.equal(results.length, 2);
    assert.ok(progressUpdates.length >= 3);
    const lastProgress = progressUpdates[progressUpdates.length - 1];
    assert.equal(lastProgress.completedFiles, 2);
    assert.equal(lastProgress.totalFiles, 2);
    assert.equal(lastProgress.completedBytes, 5000);
    assert.equal(lastProgress.totalBytes, 5000);
  } finally {
    GitHubClient.downloadFileText = originalDownload;
  }
});
