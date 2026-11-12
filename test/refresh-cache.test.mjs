import test from 'node:test';
import assert from 'node:assert/strict';
import { TreeCacheAdapter } from '../src/adapters/tree-cache-adapter.js';
import { GitHubClient } from '../src/adapters/github-client.js';
import { DomController, applyStaticTranslations } from '../src/adapters/dom-controller.js';
import { TRANSLATIONS } from '../src/adapters/i18n.js';

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
  querySelector(selector) {
    if (selector === '#refresh-repo-text') {
      return this.children.find((c) => c.id === 'refresh-repo-text') || null;
    }
    return null;
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
  appendChild(node) {
    this.children.push(node);
    return node;
  }
}

test('TreeCacheAdapter delete, deleteTree, and deleteRepo remove cached items correctly', async () => {
  const owner = 'testowner';
  const repo = 'testrepo';
  const branch = 'main';

  await TreeCacheAdapter.setTree(owner, repo, branch, { tree: [{ path: 'a.txt', type: 'blob' }] });
  await TreeCacheAdapter.setBranches(owner, repo, [{ name: 'main' }]);
  await TreeCacheAdapter.set(TreeCacheAdapter.getRepoKey(owner, repo), { default_branch: 'main' });

  let cachedTree = await TreeCacheAdapter.getTree(owner, repo, branch);
  assert.ok(cachedTree && cachedTree.data);

  await TreeCacheAdapter.deleteTree(owner, repo, branch);
  cachedTree = await TreeCacheAdapter.getTree(owner, repo, branch);
  assert.equal(cachedTree, null);

  let cachedBranches = await TreeCacheAdapter.getBranches(owner, repo);
  assert.ok(cachedBranches && cachedBranches.data);

  await TreeCacheAdapter.setTree(owner, repo, branch, { tree: [{ path: 'b.txt', type: 'blob' }] });
  await TreeCacheAdapter.deleteRepo(owner, repo);

  cachedTree = await TreeCacheAdapter.getTree(owner, repo, branch);
  cachedBranches = await TreeCacheAdapter.getBranches(owner, repo);
  const cachedRepo = await TreeCacheAdapter.get(TreeCacheAdapter.getRepoKey(owner, repo));

  assert.equal(cachedTree, null);
  assert.equal(cachedBranches, null);
  assert.equal(cachedRepo, null);
});

test('TreeCacheAdapter clear purges fallback store and all cache keys', async () => {
  await TreeCacheAdapter.set('github-scrap:cache:test:1', { val: 1 });
  await TreeCacheAdapter.set('github-scrap:cache:test:2', { val: 2 });

  let item = await TreeCacheAdapter.get('github-scrap:cache:test:1');
  assert.ok(item && item.data);

  await TreeCacheAdapter.clear();
  item = await TreeCacheAdapter.get('github-scrap:cache:test:1');
  assert.equal(item, null);
});

test('GitHubClient bypassCache forces fresh network fetch and invalidates prior cache', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;

  globalThis.fetch = async (url) => {
    fetchCallCount += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '59',
        'x-ratelimit-reset': '1700000000',
      }),
      json: async () => ({
        tree: [{ path: 'file' + fetchCallCount + '.txt', type: 'blob', sha: 'sha' + fetchCallCount }],
        truncated: false,
      }),
    };
  };

  try {
    const owner = 'freshowner';
    const repo = 'freshrepo';
    const branch = 'main';

    const res1 = await GitHubClient.fetchGitTrees(owner, repo, branch, null, 'en', { bypassCache: true });
    assert.ok(res1.ok);
    assert.equal(fetchCallCount, 1);
    assert.equal(res1.data.tree[0].path, 'file1.txt');

    const res2 = await GitHubClient.fetchGitTrees(owner, repo, branch, null, 'en', { bypassCache: false });
    assert.ok(res2.ok);
    assert.equal(fetchCallCount, 1);
    assert.equal(res2.data.tree[0].path, 'file1.txt');

    const res3 = await GitHubClient.fetchGitTrees(owner, repo, branch, null, 'en', { bypassCache: true });
    assert.ok(res3.ok);
    assert.equal(fetchCallCount, 2);
    assert.equal(res3.data.tree[0].path, 'file2.txt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DomController handles Alt+R shortcut and triggers refresh with bypassCache', async () => {
  const refreshBtn = new MockElement('button', 'refresh-repo-btn');
  const refreshText = new MockElement('span', 'refresh-repo-text');
  refreshBtn.appendChild(refreshText);

  const searchProgressBar = new MockElement('div', 'search-progress-bar');
  searchProgressBar.hidden = true;

  const branchSelect = new MockElement('select', 'branch-select');
  const statusContainer = new MockElement('div', 'status-container');
  const fileList = new MockElement('ul', 'file-list');

  const dom = {
    refreshRepoButton: refreshBtn,
    searchProgressBar,
    branchSelect,
    statusContainer,
    fileList,
  };

  const controller = new DomController(dom);
  let refreshTriggered = false;
  controller.handleRefreshClick = async () => {
    refreshTriggered = true;
  };

  let prevented = false;
  const preventDefault = () => {
    prevented = true;
  };

  controller.handleGlobalKeyDown({
    key: 'r',
    altKey: true,
    preventDefault,
  });

  assert.equal(refreshTriggered, true);
  assert.equal(prevented, true);
});

test('DomController setRefreshLoading updates button loading class and aria-busy attribute', () => {
  const refreshBtn = new MockElement('button', 'refresh-repo-btn');
  const searchProgressBar = new MockElement('div', 'search-progress-bar');
  const dom = {
    refreshRepoButton: refreshBtn,
    searchProgressBar,
  };

  const controller = new DomController(dom);
  assert.equal(controller.isRefreshing, false);

  controller.setRefreshLoading(true);
  assert.equal(controller.isRefreshing, true);
  assert.equal(refreshBtn.disabled, true);
  assert.equal(refreshBtn.classList.contains('loading'), true);
  assert.equal(refreshBtn.getAttribute('aria-busy'), 'true');
  assert.equal(searchProgressBar.hidden, false);

  controller.setRefreshLoading(false);
  assert.equal(controller.isRefreshing, false);
  assert.equal(refreshBtn.disabled, false);
  assert.equal(refreshBtn.classList.contains('loading'), false);
  assert.equal(refreshBtn.getAttribute('aria-busy'), null);
  assert.equal(searchProgressBar.hidden, true);
});

test('applyStaticTranslations updates refresh button label and title across pt-BR, en, and es', () => {
  const refreshBtn = new MockElement('button', 'refresh-repo-btn');
  const refreshText = new MockElement('span', 'refresh-repo-text');
  refreshBtn.appendChild(refreshText);

  const dom = { refreshRepoButton: refreshBtn };

  applyStaticTranslations(dom, 'pt-BR');
  assert.equal(refreshText.textContent, TRANSLATIONS['pt-BR'].refreshBtn);
  assert.equal(refreshBtn.title, TRANSLATIONS['pt-BR'].refreshBtnTitle);

  applyStaticTranslations(dom, 'en');
  assert.equal(refreshText.textContent, TRANSLATIONS['en'].refreshBtn);
  assert.equal(refreshBtn.title, TRANSLATIONS['en'].refreshBtnTitle);

  applyStaticTranslations(dom, 'es');
  assert.equal(refreshText.textContent, TRANSLATIONS['es'].refreshBtn);
  assert.equal(refreshBtn.title, TRANSLATIONS['es'].refreshBtnTitle);
});
