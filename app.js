import { DomController } from './src/adapters/dom-controller.js';

export * from './src/domain/repo-parser.js';
export * from './src/domain/file-classifier.js';
export * from './src/domain/text-formatter.js';
export * from './src/adapters/i18n.js';
export * from './src/adapters/github-client.js';
export * from './src/adapters/zip-encoder.js';
export * from './src/adapters/storage-adapter.js';
export * from './src/adapters/crypto-adapter.js';
export * from './src/adapters/dom-controller.js';

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const dom = {
      form: document.querySelector('#search-form'),
      input: document.querySelector('#search-input'),
      button: document.querySelector('#search-button'),
      tokenButton: document.querySelector('#token-button'),
      rateLimitBadge: document.querySelector('#rate-limit-badge'),
      tokenDialog: document.querySelector('#token-dialog'),
      tokenInput: document.querySelector('#token-input'),
      tokenProfileLabel: document.querySelector('#token-profile-label'),
      tokenProfilesSection: document.querySelector('#token-profiles-section'),
      tokenProfilesTitle: document.querySelector('#token-profiles-title'),
      tokenProfilesList: document.querySelector('#token-profiles-list'),
      tokenSaveBtn: document.querySelector('#token-save-btn'),
      tokenRemoveBtn: document.querySelector('#token-remove-btn'),
      tokenCloseBtn: document.querySelector('#token-close-btn'),
      tokenBackupPassword: document.querySelector('#token-backup-password'),
      tokenExportBtn: document.querySelector('#token-export-btn'),
      tokenImportBtn: document.querySelector('#token-import-btn'),
      tokenImportFile: document.querySelector('#token-import-file'),
      tokenStatus: document.querySelector('#token-status'),
      tokenValidationStatus: document.querySelector('#token-validation-status'),
      searchProgressBar: document.querySelector('#search-progress-bar'),
      statusContainer: document.querySelector('#status-container'),
      emptyState: document.querySelector('#empty-state'),
      resultsSection: document.querySelector('#results-section'),
      repoTitle: document.querySelector('#repo-title'),
      branchSelect: document.querySelector('#branch-select'),
      fileCount: document.querySelector('#file-count'),
      selectionSummary: document.querySelector('#selection-summary'),
      truncatedWarning: document.querySelector('#truncated-warning'),
      fileFilterInput: document.querySelector('#file-filter-input'),
      filterClearBtn: document.querySelector('#filter-clear-btn'),
      filterFeedback: document.querySelector('#filter-feedback'),
      fileListHeader: document.querySelector('#file-list-header'),
      selectAllCheckbox: document.querySelector('#select-all-checkbox'),
      btnSmartDefaults: document.querySelector('#btn-smart-defaults'),
      masterModeToggle: document.querySelector('#master-mode-toggle'),
      fileList: document.querySelector('#file-list'),
      generationProgressContainer: document.querySelector('#generation-progress-container'),
      generationProgressbar: document.querySelector('#generation-progressbar'),
      generationProgressBarFill: document.querySelector('#progress-bar-fill'),
      progressStatusText: document.querySelector('#progress-status-text'),
      generateButton: document.querySelector('#generate-button'),
      generateZipButton: document.querySelector('#generate-zip-button'),
      previewButton: document.querySelector('#preview-button'),
      previewDialog: document.querySelector('#preview-dialog'),
      previewTextarea: document.querySelector('#preview-textarea'),
      copyPreviewBtn: document.querySelector('#copy-preview-button'),
      openTabPreviewBtn: document.querySelector('#open-tab-preview-button'),
      closePreviewBtn: document.querySelector('#close-preview-button'),
    };

    const controller = new DomController(dom);
    controller.init();
  });
}
