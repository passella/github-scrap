import { parseGitHubRepo, buildGitHubUrls } from '../domain/repo-parser.js';
import {
  getFileType,
  classifyInitialFile,
  calculateEstimatedDestinationMetrics,
  containsNullBytes,
} from '../domain/file-classifier.js';
import {
  formatFileSize,
  formatTextBlock,
  formatReferenceBlock,
  formatConcatenatedOutput,
  buildDiagnosticReport,
} from '../domain/text-formatter.js';
import { TRANSLATIONS, detectLanguage } from './i18n.js';
import { GitHubClient, isValidGitHubTokenSyntax } from './github-client.js';
import { ZipBuilder } from './zip-encoder.js';
import { StorageAdapter } from './storage-adapter.js';
import { CryptoAdapter } from './crypto-adapter.js';

export class FileDownloadAdapter {
  static triggerFileDownload(contentOrBlob, filename) {
    const blob = contentOrBlob instanceof Blob
      ? contentOrBlob
      : new Blob([contentOrBlob], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1500);
  }
}

export class ToastNotificationAdapter {
  static init() {
    if (typeof document === 'undefined' || !document.body) return;
    this.container = document.querySelector('#toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      this.container.setAttribute('aria-live', 'polite');
      document.body.appendChild(this.container);
    }
  }

  static copyToClipboard(text, copyButton, lang = 'en') {
    const originalText = copyButton.textContent;
    const copiedLabel = lang === 'pt-BR' ? 'Copiado!' : (lang === 'es' ? '¡Copiado!' : 'Copied!');
    const errorLabel = lang === 'pt-BR' ? 'Erro ao copiar' : (lang === 'es' ? 'Error al copiar' : 'Copy error');

    const restore = () => {
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        copyButton.textContent = copiedLabel;
        restore();
      }).catch(() => {
        this.fallbackCopy(text, copyButton, restore, copiedLabel, errorLabel);
      });
    } else {
      this.fallbackCopy(text, copyButton, restore, copiedLabel, errorLabel);
    }
  }

  static fallbackCopy(text, copyButton, onDone, copiedLabel, errorLabel) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      copyButton.textContent = copiedLabel;
    } catch {
      copyButton.textContent = errorLabel;
    }
    document.body.removeChild(textarea);
    onDone();
  }

  static showSuccess(title, message, duration = 6000) {
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.setAttribute('role', 'status');

    const header = document.createElement('div');
    header.className = 'toast-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'toast-title-group';

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✅';

    const heading = document.createElement('h3');
    heading.className = 'toast-title';
    heading.textContent = title;

    titleGroup.append(icon, heading);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    header.append(titleGroup, closeBtn);

    const body = document.createElement('div');
    body.className = 'toast-body';

    const p = document.createElement('p');
    p.className = 'toast-friendly-message';
    p.textContent = message;

    body.appendChild(p);
    toast.append(header, body);

    let dismissTimer = null;
    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (toast.remove) {
          toast.remove();
        } else if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    };

    closeBtn.addEventListener('click', dismiss);

    toast.addEventListener('mouseenter', () => {
      if (dismissTimer) clearTimeout(dismissTimer);
    });

    toast.addEventListener('mouseleave', () => {
      dismissTimer = setTimeout(dismiss, 3000);
    });

    dismissTimer = setTimeout(dismiss, duration);
    this.container.prepend(toast);
  }

  static showWarning(title, message, duration = 8000) {
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-warning';
    toast.setAttribute('role', 'alert');

    const header = document.createElement('div');
    header.className = 'toast-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'toast-title-group';

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠️';

    const heading = document.createElement('h3');
    heading.className = 'toast-title';
    heading.textContent = title;

    titleGroup.append(icon, heading);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    header.append(titleGroup, closeBtn);

    const body = document.createElement('div');
    body.className = 'toast-body';

    const p = document.createElement('p');
    p.className = 'toast-friendly-message';
    p.textContent = message;

    body.appendChild(p);
    toast.append(header, body);

    let dismissTimer = null;
    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (toast.remove) {
          toast.remove();
        } else if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    };

    closeBtn.addEventListener('click', dismiss);

    toast.addEventListener('mouseenter', () => {
      if (dismissTimer) clearTimeout(dismissTimer);
    });

    toast.addEventListener('mouseleave', () => {
      dismissTimer = setTimeout(dismiss, 3000);
    });

    dismissTimer = setTimeout(dismiss, duration);
    this.container.prepend(toast);
  }

  static showError(options) {
    if (!this.container) return;

    const {
      title,
      friendlyMessage,
      operation,
      target,
      endpoint,
      status,
      apiMessage,
      rateLimit,
      timestamp,
      lang = 'en',
      duration = 25000,
    } = options;

    const locale = (TRANSLATIONS[lang] && TRANSLATIONS[lang].locale) || 'en-US';
    const diagnosticData = {
      operation: operation || 'System Operation',
      target: target || 'N/A',
      endpoint: endpoint || 'N/A',
      status: status || 'Error',
      apiMessage: apiMessage || 'N/A',
      rateLimit: rateLimit ? ('Remaining: ' + rateLimit.remaining + '/' + rateLimit.limit + ' • Reset: ' + rateLimit.resetFormatted) : 'N/A',
      timestamp: timestamp || new Date().toLocaleTimeString(locale),
      friendlyMessage: friendlyMessage || 'An error occurred.',
    };

    const fullReportText = buildDiagnosticReport(diagnosticData, lang);

    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.setAttribute('role', 'alert');

    const header = document.createElement('div');
    header.className = 'toast-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'toast-title-group';

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '❌';

    const heading = document.createElement('h3');
    heading.className = 'toast-title';
    heading.textContent = title;

    titleGroup.append(icon, heading);

    const actions = document.createElement('div');
    actions.className = 'toast-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'toast-copy-btn';
    copyBtn.textContent = lang === 'pt-BR' ? 'Copiar erro' : (lang === 'es' ? 'Copiar error' : 'Copy error');
    copyBtn.addEventListener('click', () => {
      this.copyToClipboard(fullReportText, copyBtn, lang);
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    actions.append(copyBtn, closeBtn);
    header.append(titleGroup, actions);

    const body = document.createElement('div');
    body.className = 'toast-body';

    const friendlyP = document.createElement('p');
    friendlyP.className = 'toast-friendly-message';
    friendlyP.textContent = diagnosticData.friendlyMessage;

    const dl = document.createElement('dl');
    dl.className = 'toast-diag-list';

    const labels = lang === 'pt-BR'
      ? ['Etapa / Operação', 'Repositório / Alvo', 'Endpoint / URL', 'Status HTTP', 'Mensagem da API', 'Rate Limit', 'Horário']
      : (lang === 'es'
        ? ['Etapa / Operación', 'Repositorio / Objetivo', 'Endpoint / URL', 'Estado HTTP', 'Mensaje de la API', 'Límite de tasa', 'Hora']
        : ['Step / Operation', 'Repository / Target', 'Endpoint / URL', 'HTTP Status', 'API Message', 'Rate Limit', 'Timestamp']);

    const fields = [
      [labels[0], diagnosticData.operation],
      [labels[1], diagnosticData.target],
      [labels[2], diagnosticData.endpoint],
      [labels[3], diagnosticData.status],
      [labels[4], diagnosticData.apiMessage],
      [labels[5], diagnosticData.rateLimit],
      [labels[6], diagnosticData.timestamp],
    ];

    for (let i = 0; i < fields.length; i += 1) {
      const [term, val] = fields[i];
      const row = document.createElement('div');
      row.className = 'toast-diag-row';

      const dt = document.createElement('dt');
      dt.className = 'toast-diag-dt';
      dt.textContent = term + ':';

      const dd = document.createElement('dd');
      dd.className = 'toast-diag-dd';
      dd.textContent = val;

      row.append(dt, dd);
      dl.appendChild(row);
    }

    body.append(friendlyP, dl);
    toast.append(header, body);

    let dismissTimer = null;
    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (toast.remove) {
          toast.remove();
        } else if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    };

    closeBtn.addEventListener('click', dismiss);

    toast.addEventListener('mouseenter', () => {
      if (dismissTimer) clearTimeout(dismissTimer);
    });

    toast.addEventListener('mouseleave', () => {
      dismissTimer = setTimeout(dismiss, 10000);
    });

    dismissTimer = setTimeout(dismiss, duration);
    this.container.prepend(toast);
  }
}

export function applyStaticTranslations(dom, lang) {
  const i18n = TRANSLATIONS[lang] || TRANSLATIONS['en'];
  if (typeof document !== 'undefined') {
    if (document.documentElement) {
      document.documentElement.lang = lang;
    }
    document.title = i18n.title;

    const skipLink = document.querySelector('.skip-link');
    if (skipLink) skipLink.textContent = i18n.skipLink;

    const searchLabel = document.querySelector('label[for="search-input"]');
    if (searchLabel) searchLabel.textContent = i18n.searchLabel;

    const branchLabel = document.querySelector('label[for="branch-select"]');
    if (branchLabel) branchLabel.textContent = i18n.branchLabel;

    const tokenLabel = document.querySelector('#token-button-label');
    if (tokenLabel) tokenLabel.textContent = i18n.tokenButton;

    const tokenDialogTitle = document.querySelector('#token-dialog-title');
    if (tokenDialogTitle) tokenDialogTitle.textContent = i18n.tokenDialogTitle;

    const tokenDialogDesc = document.querySelector('#token-dialog-desc');
    if (tokenDialogDesc) tokenDialogDesc.textContent = i18n.tokenDialogDesc;

    const tokenGenerateLink = document.querySelector('#token-generate-link');
    if (tokenGenerateLink) tokenGenerateLink.textContent = i18n.tokenGenerateLink;

    const tokenSaveBtn = document.querySelector('#token-save-btn');
    if (tokenSaveBtn) tokenSaveBtn.textContent = i18n.tokenSaveBtn;

    const tokenRemoveBtn = document.querySelector('#token-remove-btn');
    if (tokenRemoveBtn) tokenRemoveBtn.textContent = i18n.tokenRemoveBtn;

    const tokenCloseBtn = document.querySelector('#token-close-btn');
    if (tokenCloseBtn) tokenCloseBtn.textContent = i18n.tokenCloseBtn;

    const emptyText = document.querySelector('.empty-text');
    if (emptyText) emptyText.innerHTML = i18n.emptyText;

    const emptyHint = document.querySelector('.empty-hint');
    if (emptyHint) emptyHint.innerHTML = i18n.emptyHint;

    const filterLabel = document.querySelector('label[for="file-filter-input"]');
    if (filterLabel) filterLabel.textContent = i18n.filterLabel;

    const selectAllText = document.querySelector('#select-all-text');
    if (selectAllText) selectAllText.textContent = i18n.selectAll;

    const colType = document.querySelector('.col-header-type');
    if (colType) colType.textContent = i18n.colType;

    const colSize = document.querySelector('.col-header-size');
    if (colSize) colSize.textContent = i18n.colSize;
  }

  if (dom.input) {
    dom.input.placeholder = i18n.searchPlaceholder;
  }

  if (dom.button) {
    dom.button.textContent = i18n.searchButton;
  }

  if (dom.tokenButton) {
    dom.tokenButton.setAttribute('aria-label', i18n.tokenButtonAria);
  }

  if (dom.tokenInput) {
    dom.tokenInput.placeholder = i18n.tokenInputPlaceholder;
    dom.tokenInput.setAttribute('aria-label', i18n.tokenInputAria);
  }

  if (dom.tokenProfileLabel) {
    dom.tokenProfileLabel.placeholder = i18n.tokenProfileLabelPlaceholder;
  }

  if (dom.tokenProfilesTitle) {
    dom.tokenProfilesTitle.textContent = i18n.tokenProfilesTitle;
  }

  const tokenBackupTitle = document.querySelector('#token-backup-title');
  if (tokenBackupTitle) tokenBackupTitle.textContent = i18n.tokenBackupTitle;

  if (dom.tokenBackupPassword) {
    dom.tokenBackupPassword.placeholder = i18n.tokenBackupPasswordPlaceholder;
  }

  if (dom.tokenExportBtn) {
    dom.tokenExportBtn.textContent = i18n.tokenExportBtn;
  }

  if (dom.tokenImportBtn) {
    dom.tokenImportBtn.textContent = i18n.tokenImportBtn;
  }

  if (dom.branchSelect) {
    dom.branchSelect.setAttribute('aria-label', i18n.branchSelectAria);
  }

  if (dom.truncatedWarning) {
    dom.truncatedWarning.innerHTML = i18n.truncatedWarning;
  }

  if (dom.fileFilterInput) {
    dom.fileFilterInput.placeholder = i18n.filterPlaceholder;
  }

  if (dom.filterClearBtn) {
    dom.filterClearBtn.setAttribute('aria-label', i18n.filterClearAria);
  }

  if (dom.btnSmartDefaults) {
    dom.btnSmartDefaults.textContent = i18n.smartDefaults;
    dom.btnSmartDefaults.title = i18n.smartDefaultsTitle;
  }

  if (dom.masterModeToggle) {
    dom.masterModeToggle.setAttribute('aria-label', i18n.masterToggleAria);
  }

  if (dom.generationProgressbar) {
    dom.generationProgressbar.setAttribute('aria-label', i18n.progressAriaLabel);
  }
}

export class DomController {
  constructor(domElements) {
    this.dom = domElements;
    this.activeSearchAbortController = null;
    this.activeGenerationAbortController = null;
    this.currentRepoContext = null;
    this.activeFilterQuery = '';
    this.matchingIndices = [];
    this.currentMatchPointer = -1;
    this.lang = detectLanguage();
    this.i18n = TRANSLATIONS[this.lang] || TRANSLATIONS['en'];
  }

  init() {
    ToastNotificationAdapter.init();
    applyStaticTranslations(this.dom, this.lang);
    this.updateTokenUI();

    GitHubClient.onRateLimitChange((rateLimit) => {
      this.updateRateLimitBadge(rateLimit);
    });

    if (StorageAdapter.hasGitHubToken()) {
      const savedToken = StorageAdapter.getGitHubToken();
      const active = StorageAdapter.getActiveProfile();
      GitHubClient.validateGithubToken(savedToken, { lang: this.lang }).then((result) => {
        if (result.valid) {
          if (result.username) {
            StorageAdapter.setGitHubUsername(result.username);
          }
          if (active) {
            StorageAdapter.updateProfileStatus(active.id, {
              status: result.isExpiringSoon ? 'expiring' : 'valid',
              lastVerifiedAt: new Date().toISOString(),
              expiresAt: result.expiresAt,
              expiresAtFormatted: result.expiresAtFormatted,
            });
          }
          this.updateTokenUI();
          if (result.isExpiringSoon) {
            ToastNotificationAdapter.showWarning(
              this.i18n.toastTokenExpiringSoonTitle,
              this.i18n.toastTokenExpiringSoonMessage(result.daysUntilExpiration, result.expiresAtFormatted)
            );
          }
        } else if (result.status === 401) {
          if (active) {
            StorageAdapter.updateProfileStatus(active.id, {
              status: 'invalid',
              lastVerifiedAt: new Date().toISOString(),
            });
          }
          StorageAdapter.removeGitHubToken();
          this.updateTokenUI();
          ToastNotificationAdapter.showWarning(
            this.i18n.tokenDialogTitle,
            this.i18n.toastTokenExpired
          );
        }
      }).catch(() => {
      });
    }

    const storedRepo = StorageAdapter.getStoredRepoUrl();
    if (storedRepo && this.dom.input) {
      this.dom.input.value = storedRepo;
    }
    if (this.dom.input && typeof this.dom.input.focus === 'function') {
      this.dom.input.focus();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          if (this.dom.resultsSection && !this.dom.resultsSection.hidden && this.dom.fileFilterInput) {
            this.dom.fileFilterInput.focus();
            if (typeof this.dom.fileFilterInput.select === 'function') {
              this.dom.fileFilterInput.select();
            }
          } else if (this.dom.input) {
            this.dom.input.focus();
            if (typeof this.dom.input.select === 'function') {
              this.dom.input.select();
            }
          }
        }
      });
    }

    if (this.dom.tokenButton) {
      this.dom.tokenButton.addEventListener('click', () => {
        this.openTokenDialog();
      });
    }

    if (this.dom.rateLimitBadge) {
      this.dom.rateLimitBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openTokenDialog();
      });
    }

    if (this.dom.tokenSaveBtn) {
      this.dom.tokenSaveBtn.addEventListener('click', () => {
        this.saveToken();
      });
    }

    if (this.dom.tokenRemoveBtn) {
      this.dom.tokenRemoveBtn.addEventListener('click', () => {
        this.removeToken();
      });
    }

    if (this.dom.tokenCloseBtn) {
      this.dom.tokenCloseBtn.addEventListener('click', () => {
        this.closeTokenDialog();
      });
    }

    if (this.dom.tokenExportBtn) {
      this.dom.tokenExportBtn.addEventListener('click', () => {
        this.handleExportProfiles();
      });
    }

    if (this.dom.tokenImportBtn && this.dom.tokenImportFile) {
      this.dom.tokenImportBtn.addEventListener('click', () => {
        this.dom.tokenImportFile.click();
      });
      this.dom.tokenImportFile.addEventListener('change', (e) => {
        this.handleImportProfiles(e);
      });
    }

    const tokenCloseIconBtn = this.dom.tokenCloseIconBtn || (typeof document !== 'undefined' ? document.querySelector('#token-close-icon-btn') : null);
    if (tokenCloseIconBtn) {
      tokenCloseIconBtn.addEventListener('click', () => {
        this.closeTokenDialog();
      });
    }

    if (this.dom.form) {
      this.dom.form.addEventListener('submit', (e) => this.handleSearchSubmit(e));
    }

    if (this.dom.branchSelect) {
      this.dom.branchSelect.addEventListener('change', (e) => this.handleBranchChange(e));
    }

    if (this.dom.fileList) {
      this.dom.fileList.addEventListener('change', (e) => this.handleFileListChange(e));
      this.dom.fileList.addEventListener('click', (e) => this.handleFileListClick(e));
    }

    if (this.dom.selectAllCheckbox) {
      this.dom.selectAllCheckbox.addEventListener('change', () => {
        this.setAllSelection(this.dom.selectAllCheckbox.checked);
      });
    }

    if (this.dom.btnSmartDefaults) {
      this.dom.btnSmartDefaults.addEventListener('click', () => {
        this.restoreSmartDefaults();
      });
    }

    if (this.dom.masterModeToggle) {
      this.dom.masterModeToggle.addEventListener('click', () => {
        this.handleMasterModeToggle();
      });
    }

    if (this.dom.fileFilterInput) {
      this.dom.fileFilterInput.addEventListener('input', () => {
        this.handleFilterInput();
      });
      this.dom.fileFilterInput.addEventListener('keydown', (e) => {
        this.handleFilterKeyDown(e);
      });
    }

    if (this.dom.filterClearBtn) {
      this.dom.filterClearBtn.addEventListener('click', () => {
        this.clearFilter();
      });
    }

    if (this.dom.generateButton) {
      this.dom.generateButton.addEventListener('click', () => {
        this.executeGeneration();
      });
    }

    if (this.dom.generateZipButton) {
      this.dom.generateZipButton.addEventListener('click', () => {
        this.executeZipGeneration();
      });
    }

    if (this.dom.previewButton) {
      this.dom.previewButton.addEventListener('click', () => {
        this.executePreview();
      });
    }

    const copyPreviewBtn = this.dom.copyPreviewBtn || (typeof document !== 'undefined' ? document.querySelector('#copy-preview-button') : null);
    if (copyPreviewBtn) {
      copyPreviewBtn.addEventListener('click', () => {
        this.copyPreviewContent();
      });
    }

    const openTabPreviewBtn = this.dom.openTabPreviewBtn || (typeof document !== 'undefined' ? document.querySelector('#open-tab-preview-button') : null);
    if (openTabPreviewBtn) {
      openTabPreviewBtn.addEventListener('click', () => {
        this.openPreviewInNewTab();
      });
    }

    const closePreviewBtn = this.dom.closePreviewBtn || (typeof document !== 'undefined' ? document.querySelector('#close-preview-button') : null);
    if (closePreviewBtn) {
      closePreviewBtn.addEventListener('click', () => {
        this.closePreviewDialog();
      });
    }
  }

  updateRateLimitBadge(rateLimit) {
    if (!this.dom.rateLimitBadge || !rateLimit) return;
    const remaining = Number(rateLimit.remaining);
    this.dom.rateLimitBadge.textContent = rateLimit.remaining + '/' + rateLimit.limit;
    this.dom.rateLimitBadge.hidden = false;

    const hasToken = StorageAdapter.hasGitHubToken();
    const active = StorageAdapter.getActiveProfile();
    const scopesStr = rateLimit.scopes || (active && active.scopes) || (hasToken ? 'repo, read:user' : null);
    const tooltip = this.i18n.rateLimitTooltip(
      rateLimit.remaining,
      rateLimit.limit,
      rateLimit.resetFormatted,
      scopesStr
    );
    this.dom.rateLimitBadge.setAttribute('title', tooltip);

    if (this.dom.rateLimitBadge.classList && typeof this.dom.rateLimitBadge.classList.remove === 'function') {
      this.dom.rateLimitBadge.classList.remove('rate-limit-warning', 'rate-limit-danger');
      if (remaining <= 5) {
        this.dom.rateLimitBadge.classList.add('rate-limit-danger');
      } else if (remaining <= 15) {
        this.dom.rateLimitBadge.classList.add('rate-limit-warning');
      }
    }
  }

  updateTokenUI() {
    const hasToken = StorageAdapter.hasGitHubToken();
    const active = StorageAdapter.getActiveProfile();
    const username = active && active.username ? active.username : StorageAdapter.getGitHubUsername();

    if (this.dom.tokenButton && this.dom.tokenButton.classList && typeof this.dom.tokenButton.classList.toggle === 'function') {
      this.dom.tokenButton.classList.toggle('token-button-active', hasToken);
    }

    const tokenLabel = (this.dom.tokenButton && typeof this.dom.tokenButton.querySelector === 'function' ? this.dom.tokenButton.querySelector('#token-button-label') : null)
      || (typeof document !== 'undefined' ? document.querySelector('#token-button-label') : null);
    if (tokenLabel) {
      const displayLabel = active && active.label && active.label !== 'Padrão'
        ? active.label
        : (username ? '@' + username : '');
      tokenLabel.textContent = hasToken ? this.i18n.tokenButtonActiveLabel(displayLabel) : this.i18n.tokenButton;
    }

    const tokenStatus = this.dom.tokenStatus || (typeof document !== 'undefined' ? document.querySelector('#token-status') : null);
    if (tokenStatus) {
      const scopesText = active && active.scopes ? ' • ' + (this.lang === 'pt-BR' ? 'Escopos: ' : (this.lang === 'es' ? 'Alcances: ' : 'Scopes: ')) + active.scopes : '';
      tokenStatus.textContent = hasToken
        ? (username ? this.i18n.tokenActiveStatusWithUser(username) + scopesText : this.i18n.tokenActiveStatus)
        : this.i18n.tokenInactiveStatus;
      if (tokenStatus.classList && typeof tokenStatus.classList.toggle === 'function') {
        tokenStatus.classList.toggle('token-status-active', hasToken);
      }
    }
    if (this.dom.tokenInput) {
      this.dom.tokenInput.value = StorageAdapter.getGitHubToken();
    }
    if (this.dom.tokenProfileLabel) {
      this.dom.tokenProfileLabel.value = active && active.label && active.label !== 'Padrão' && !active.label.startsWith('@') ? active.label : '';
    }
  }

  showTokenValidationStatus(message, type = 'loading') {
    const el = this.dom.tokenValidationStatus || (typeof document !== 'undefined' ? document.querySelector('#token-validation-status') : null);
    if (!el) return;
    el.hidden = false;
    el.className = 'token-validation-status token-validation-status-' + type;
    el.textContent = message;
  }

  clearTokenValidationStatus() {
    const el = this.dom.tokenValidationStatus || (typeof document !== 'undefined' ? document.querySelector('#token-validation-status') : null);
    if (!el) return;
    el.hidden = true;
    el.className = 'token-validation-status';
    el.textContent = '';
  }

  renderTokenProfilesList() {
    const section = this.dom.tokenProfilesSection || (typeof document !== 'undefined' ? document.querySelector('#token-profiles-section') : null);
    const list = this.dom.tokenProfilesList || (typeof document !== 'undefined' ? document.querySelector('#token-profiles-list') : null);
    if (!section || !list) return;

    const profiles = StorageAdapter.getTokenProfiles();
    if (!profiles || profiles.length === 0) {
      section.hidden = true;
      list.innerHTML = '';
      return;
    }

    section.hidden = false;
    list.innerHTML = '';

    for (let i = 0; i < profiles.length; i += 1) {
      const p = profiles[i];
      const li = document.createElement('li');
      li.className = 'token-profile-item' + (p.active ? ' token-profile-active' : '');

      const info = document.createElement('div');
      info.className = 'token-profile-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'token-profile-name-row';

      const dot = document.createElement('span');
      const statusKey = p.status || 'unverified';
      dot.className = 'profile-status-dot profile-status-' + statusKey;

      let statusTooltip = this.i18n.profileStatusUnverified;
      if (statusKey === 'valid') {
        statusTooltip = this.i18n.profileStatusValid;
      } else if (statusKey === 'expiring') {
        statusTooltip = this.i18n.profileStatusExpiring(p.daysUntilExpiration || '<= 7');
      } else if (statusKey === 'invalid') {
        statusTooltip = this.i18n.profileStatusInvalid;
      }

      if (p.lastVerifiedAt) {
        try {
          const locale = (TRANSLATIONS[this.lang] && TRANSLATIONS[this.lang].locale) || 'en-US';
          const timeStr = new Date(p.lastVerifiedAt).toLocaleTimeString(locale);
          statusTooltip += ' • ' + this.i18n.profileLastVerified(timeStr);
        } catch {
        }
      }

      dot.setAttribute('title', statusTooltip);
      dot.setAttribute('aria-label', statusTooltip);
      nameRow.appendChild(dot);

      const labelText = document.createElement('span');
      labelText.className = 'token-profile-label-text';
      labelText.textContent = p.label || 'Padrão';
      nameRow.appendChild(labelText);

      if (p.active) {
        const badge = document.createElement('span');
        badge.className = 'token-profile-active-badge';
        badge.textContent = this.i18n.tokenProfileActiveBadge;
        nameRow.appendChild(badge);
      }

      const meta = document.createElement('div');
      meta.className = 'token-profile-meta';
      const metaParts = [];
      if (p.username) metaParts.push('@' + p.username);
      if (p.scopes) metaParts.push(p.scopes);
      if (p.expiresAtFormatted) metaParts.push(this.i18n.profileExpiresAt(p.expiresAtFormatted));
      meta.textContent = metaParts.join(' • ');

      info.append(nameRow, meta);

      const actions = document.createElement('div');
      actions.className = 'token-profile-actions';

      if (!p.active) {
        const activateBtn = document.createElement('button');
        activateBtn.type = 'button';
        activateBtn.className = 'token-profile-btn token-profile-btn-activate';
        activateBtn.textContent = this.i18n.tokenProfileActivateBtn;
        activateBtn.addEventListener('click', () => {
          this.activateTokenProfile(p.id);
        });
        actions.appendChild(activateBtn);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'token-profile-btn token-profile-btn-delete';
      deleteBtn.textContent = this.i18n.tokenProfileDeleteBtn;
      deleteBtn.addEventListener('click', () => {
        this.deleteTokenProfile(p.id);
      });
      actions.appendChild(deleteBtn);

      li.append(info, actions);
      list.appendChild(li);
    }
  }

  activateTokenProfile(profileId) {
    const activated = StorageAdapter.setActiveTokenProfile(profileId);
    if (!activated) return;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    this.updateTokenUI();
    this.renderTokenProfilesList();
    ToastNotificationAdapter.showSuccess(
      this.i18n.tokenDialogTitle,
      this.i18n.toastProfileActivated(activated.label || activated.username || 'Token')
    );
  }

  deleteTokenProfile(profileId) {
    const deleted = StorageAdapter.deleteTokenProfile(profileId);
    if (!deleted) return;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    this.updateTokenUI();
    this.renderTokenProfilesList();
    ToastNotificationAdapter.showSuccess(
      this.i18n.tokenDialogTitle,
      this.i18n.toastProfileDeleted(deleted.label || deleted.username || 'Token')
    );
  }

  openTokenDialog() {
    this.clearTokenValidationStatus();
    this.updateTokenUI();
    this.renderTokenProfilesList();
    const dialog = this.dom.tokenDialog || (typeof document !== 'undefined' ? document.querySelector('#token-dialog') : null);
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
      if (this.dom.tokenInput && typeof this.dom.tokenInput.focus === 'function') {
        this.dom.tokenInput.focus();
      }
    }
  }

  closeTokenDialog() {
    this.clearTokenValidationStatus();
    const dialog = this.dom.tokenDialog || (typeof document !== 'undefined' ? document.querySelector('#token-dialog') : null);
    if (dialog && typeof dialog.close === 'function') {
      dialog.close();
    }
  }

  async saveToken() {
    const rawVal = this.dom.tokenInput ? this.dom.tokenInput.value.trim() : '';
    if (!rawVal) {
      this.showTokenValidationStatus(this.i18n.tokenErrorEmpty, 'error');
      ToastNotificationAdapter.showError({
        title: this.i18n.tokenDialogTitle,
        friendlyMessage: this.i18n.tokenErrorEmpty,
        operation: 'Token Configuration',
        target: 'GitHub API Authentication',
        endpoint: 'https://api.github.com/user',
        status: 'Validation Error',
        apiMessage: 'Empty token input',
        lang: this.lang,
      });
      return;
    }

    if (!isValidGitHubTokenSyntax(rawVal)) {
      this.showTokenValidationStatus(this.i18n.tokenErrorFormat, 'error');
      ToastNotificationAdapter.showError({
        title: this.i18n.tokenDialogTitle,
        friendlyMessage: this.i18n.tokenErrorFormat,
        operation: 'Syntax Validation',
        target: 'GitHub API Authentication',
        endpoint: 'Fast-path local check',
        status: 'Validation Error',
        apiMessage: 'Invalid token syntax pattern',
        lang: this.lang,
      });
      return;
    }

    const saveBtn = this.dom.tokenSaveBtn || (typeof document !== 'undefined' ? document.querySelector('#token-save-btn') : null);
    const originalText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = this.i18n.tokenValidating;
    }
    this.showTokenValidationStatus(this.i18n.tokenValidatingDesc, 'loading');

    const profileLabelInput = this.dom.tokenProfileLabel || (typeof document !== 'undefined' ? document.querySelector('#token-profile-label') : null);
    const customLabel = profileLabelInput ? profileLabelInput.value.trim() : '';

    try {
      const result = await GitHubClient.validateGithubToken(rawVal, { lang: this.lang });
      if (result.valid) {
        const finalLabel = customLabel || (result.username ? '@' + result.username : 'Padrão');
        StorageAdapter.saveTokenProfile({
          label: finalLabel,
          username: result.username || '',
          token: rawVal,
          scopes: result.scopes || '',
          status: result.isExpiringSoon ? 'expiring' : 'valid',
          expiresAt: result.expiresAt,
          expiresAtFormatted: result.expiresAtFormatted,
          lastVerifiedAt: new Date().toISOString(),
        });
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
        }
        this.updateTokenUI();
        this.renderTokenProfilesList();
        this.clearTokenValidationStatus();
        this.closeTokenDialog();
        const limitStr = result.rateLimit ? result.rateLimit.limit : '5.000';
        const msg = result.username
          ? this.i18n.toastTokenValidated(result.username, limitStr)
          : this.i18n.toastTokenValidatedNoUser(limitStr);
        ToastNotificationAdapter.showSuccess(
          this.i18n.tokenDialogTitle,
          msg
        );
        if (result.isExpiringSoon) {
          ToastNotificationAdapter.showWarning(
            this.i18n.toastTokenExpiringSoonTitle,
            this.i18n.toastTokenExpiringSoonMessage(result.daysUntilExpiration, result.expiresAtFormatted)
          );
        }
      } else {
        const errorMsg = result.message || this.i18n.tokenErrorInvalid;
        this.showTokenValidationStatus(errorMsg, 'error');
        ToastNotificationAdapter.showError({
          title: this.i18n.tokenDialogTitle,
          friendlyMessage: errorMsg,
          operation: 'Token Authentication',
          target: 'GitHub API Authentication',
          endpoint: 'https://api.github.com/user',
          status: result.status ? String(result.status) : 'Unauthorized',
          apiMessage: errorMsg,
          rateLimit: result.rateLimit,
          lang: this.lang,
        });
      }
    } catch (err) {
      const errorMsg = err.message || this.i18n.tokenErrorGeneric;
      this.showTokenValidationStatus(errorMsg, 'error');
      ToastNotificationAdapter.showError({
        title: this.i18n.tokenDialogTitle,
        friendlyMessage: errorMsg,
        operation: 'Token Authentication',
        target: 'GitHub API Authentication',
        endpoint: 'https://api.github.com/user',
        status: 'Error',
        apiMessage: errorMsg,
        lang: this.lang,
      });
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText || this.i18n.tokenSaveBtn;
      }
    }
  }

  removeToken() {
    StorageAdapter.removeGitHubToken();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    this.updateTokenUI();
    this.renderTokenProfilesList();
    this.clearTokenValidationStatus();
    this.closeTokenDialog();
    ToastNotificationAdapter.showSuccess(
      this.i18n.tokenDialogTitle,
      this.i18n.toastTokenRemoved
    );
  }

  async handleExportProfiles() {
    const passwordInput = this.dom.tokenBackupPassword || (typeof document !== 'undefined' ? document.querySelector('#token-backup-password') : null);
    const password = passwordInput ? passwordInput.value : '';
    if (!password) {
      ToastNotificationAdapter.showWarning(
        this.i18n.tokenBackupTitle,
        this.i18n.toastBackupPasswordRequired
      );
      if (passwordInput && typeof passwordInput.focus === 'function') {
        passwordInput.focus();
      }
      return;
    }

    const profiles = StorageAdapter.getTokenProfiles();
    if (!profiles || profiles.length === 0) {
      ToastNotificationAdapter.showWarning(
        this.i18n.tokenBackupTitle,
        this.i18n.toastBackupNoProfiles
      );
      return;
    }

    try {
      const payload = await CryptoAdapter.encryptProfiles(profiles, password);
      const jsonStr = JSON.stringify(payload, null, 2);
      FileDownloadAdapter.triggerFileDownload(jsonStr, 'github-scrap-profiles.enc.json');
      ToastNotificationAdapter.showSuccess(
        this.i18n.tokenBackupTitle,
        this.i18n.toastBackupExportSuccess
      );
      if (passwordInput) {
        passwordInput.value = '';
      }
    } catch (err) {
      ToastNotificationAdapter.showError({
        title: this.i18n.tokenBackupTitle,
        friendlyMessage: err.message || 'Encryption failed',
        operation: 'Profile Export',
        target: 'Encrypted JSON',
        endpoint: 'Web Crypto API',
        status: 'Error',
        apiMessage: err.message,
        lang: this.lang,
      });
    }
  }

  async handleImportProfiles(e) {
    const file = e.target && e.target.files && e.target.files[0];
    if (!file) return;

    const passwordInput = this.dom.tokenBackupPassword || (typeof document !== 'undefined' ? document.querySelector('#token-backup-password') : null);
    const password = passwordInput ? passwordInput.value : '';
    if (!password) {
      ToastNotificationAdapter.showWarning(
        this.i18n.tokenBackupTitle,
        this.i18n.toastBackupPasswordRequired
      );
      if (passwordInput && typeof passwordInput.focus === 'function') {
        passwordInput.focus();
      }
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const imported = await CryptoAdapter.decryptProfiles(text, password);
      const count = StorageAdapter.importProfiles(imported);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
      this.updateTokenUI();
      this.renderTokenProfilesList();
      ToastNotificationAdapter.showSuccess(
        this.i18n.tokenBackupTitle,
        this.i18n.toastBackupImportSuccess(count)
      );
      if (passwordInput) {
        passwordInput.value = '';
      }
    } catch {
      ToastNotificationAdapter.showError({
        title: this.i18n.tokenBackupTitle,
        friendlyMessage: this.i18n.toastBackupImportError,
        operation: 'Profile Import',
        target: file.name,
        endpoint: 'Web Crypto API',
        status: 'Decryption Error',
        apiMessage: 'Password mismatch or corrupted payload',
        lang: this.lang,
      });
    } finally {
      e.target.value = '';
    }
  }

  openPreviewDialog(filename, formattedSize, content) {
    const dialog = this.dom.previewDialog || (typeof document !== 'undefined' ? document.querySelector('#preview-dialog') : null);
    const textarea = this.dom.previewTextarea || (typeof document !== 'undefined' ? document.querySelector('#preview-textarea') : null);
    const title = this.dom.previewTitle || (typeof document !== 'undefined' ? document.querySelector('#preview-title') : null);
    const sizeBadge = this.dom.previewSizeBadge || (typeof document !== 'undefined' ? document.querySelector('#preview-size-badge') : null);

    if (title) title.textContent = filename;
    if (sizeBadge) sizeBadge.textContent = formattedSize;
    if (textarea) textarea.value = content;

    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
      if (textarea && typeof textarea.focus === 'function') {
        textarea.focus();
      }
    }
  }

  closePreviewDialog() {
    const dialog = this.dom.previewDialog || (typeof document !== 'undefined' ? document.querySelector('#preview-dialog') : null);
    if (dialog && typeof dialog.close === 'function') {
      dialog.close();
    }
  }

  copyPreviewContent() {
    const textarea = this.dom.previewTextarea || (typeof document !== 'undefined' ? document.querySelector('#preview-textarea') : null);
    if (!textarea) return;
    const text = textarea.value;

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        ToastNotificationAdapter.showSuccess(this.i18n.toastCopiedToClipboard, this.currentRepoContext ? this.currentRepoContext.repo + '.txt' : 'preview.txt');
      }).catch(() => {
        if (typeof textarea.select === 'function') textarea.select();
        if (typeof document !== 'undefined') document.execCommand('copy');
        ToastNotificationAdapter.showSuccess(this.i18n.toastCopiedToClipboard, this.currentRepoContext ? this.currentRepoContext.repo + '.txt' : 'preview.txt');
      });
    } else {
      if (typeof textarea.select === 'function') textarea.select();
      if (typeof document !== 'undefined') document.execCommand('copy');
      ToastNotificationAdapter.showSuccess(this.i18n.toastCopiedToClipboard, this.currentRepoContext ? this.currentRepoContext.repo + '.txt' : 'preview.txt');
    }
  }

  openPreviewInNewTab() {
    const textarea = this.dom.previewTextarea || (typeof document !== 'undefined' ? document.querySelector('#preview-textarea') : null);
    if (!textarea) return;
    const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }

  setSearchLoading(isLoading) {
    if (this.dom.button) {
      this.dom.button.disabled = isLoading;
      this.dom.button.textContent = isLoading ? this.i18n.searchButtonLoading : this.i18n.searchButton;
    }
    if (this.dom.input) {
      this.dom.input.disabled = isLoading;
    }
    if (this.dom.searchProgressBar) {
      this.dom.searchProgressBar.hidden = !isLoading;
    }
    if (isLoading && this.dom.statusContainer) {
      this.dom.statusContainer.replaceChildren();
    }
  }

  showErrorBanner(friendlyMessage) {
    this.currentRepoContext = null;

    if (this.activeGenerationAbortController) {
      this.activeGenerationAbortController.abort();
      this.activeGenerationAbortController = null;
    }

    if (!this.dom.statusContainer) return;
    this.dom.statusContainer.replaceChildren();

    const banner = document.createElement('div');
    banner.className = 'status-banner status-banner-error';
    banner.setAttribute('role', 'alert');

    const icon = document.createElement('span');
    icon.className = 'status-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '❌';

    const text = document.createElement('span');
    text.textContent = friendlyMessage;

    banner.append(icon, text);
    this.dom.statusContainer.appendChild(banner);

    if (this.dom.resultsSection) {
      this.dom.resultsSection.hidden = true;
    }
    if (this.dom.emptyState) {
      this.dom.emptyState.hidden = false;
    }
  }

  async handleSearchSubmit(event) {
    event.preventDefault();

    const rawInput = this.dom.input ? this.dom.input.value.trim() : '';
    if (!rawInput) {
      if (this.dom.input) this.dom.input.focus();
      return;
    }

    StorageAdapter.setStoredRepoUrl(rawInput);

    const parsed = parseGitHubRepo(rawInput);
    if (!parsed) {
      const msg = this.i18n.errInvalidFormatMsg;
      this.showErrorBanner(msg);
      ToastNotificationAdapter.showError({
        title: this.i18n.errInvalidFormatTitle,
        friendlyMessage: msg,
        operation: 'Input Validation',
        target: rawInput,
        endpoint: 'Client-side Validation',
        status: 'Client Format Error',
        apiMessage: 'Regular expression validation failed on repository string.',
        rateLimit: null,
        lang: this.lang,
      });
      if (this.dom.input) this.dom.input.focus();
      return;
    }

    if (this.activeSearchAbortController) {
      this.activeSearchAbortController.abort();
    }
    this.activeSearchAbortController = new AbortController();
    const signal = this.activeSearchAbortController.signal;

    this.setSearchLoading(true);
    const searchStartTime = performance.now();

    try {
      let activeBranch = parsed.branch;

      if (!activeBranch) {
        const repoResult = await GitHubClient.fetchRepoDetails(parsed.owner, parsed.repo, signal, this.lang);
        if (!repoResult.ok) {
          this.showErrorBanner(repoResult.friendlyMessage);
          ToastNotificationAdapter.showError({
            title: this.lang === 'pt-BR' ? 'Erro ao consultar repositório' : (this.lang === 'es' ? 'Error al consultar repositorio' : 'Error fetching repository'),
            friendlyMessage: repoResult.friendlyMessage,
            operation: 'GitHub Repo Metadata API',
            target: parsed.owner + '/' + parsed.repo,
            endpoint: repoResult.endpoint,
            status: repoResult.status,
            apiMessage: repoResult.apiMessage,
            rateLimit: repoResult.rateLimit,
            lang: this.lang,
          });
          return;
        }
        activeBranch = repoResult.data.default_branch || 'main';
      }

      const [treeResult, branchesResult] = await Promise.all([
        GitHubClient.fetchGitTrees(parsed.owner, parsed.repo, activeBranch, signal, this.lang),
        GitHubClient.fetchBranches(parsed.owner, parsed.repo, signal, this.lang),
      ]);

      if (!treeResult.ok) {
        this.showErrorBanner(treeResult.friendlyMessage);
        ToastNotificationAdapter.showError({
          title: this.lang === 'pt-BR' ? 'Erro ao consultar árvore de arquivos' : (this.lang === 'es' ? 'Error al consultar árbol de archivos' : 'Error fetching file tree'),
          friendlyMessage: treeResult.friendlyMessage,
          operation: 'GitHub Git Trees API',
          target: parsed.owner + '/' + parsed.repo + ' (' + activeBranch + ')',
          endpoint: treeResult.endpoint,
          status: treeResult.status,
          apiMessage: treeResult.apiMessage,
          rateLimit: treeResult.rateLimit,
          lang: this.lang,
        });
        return;
      }

      let branchNames = [];
      if (branchesResult.ok && Array.isArray(branchesResult.data) && branchesResult.data.length > 0) {
        branchNames = branchesResult.data.map((b) => b.name);
      }
      if (!branchNames.includes(activeBranch)) {
        branchNames.unshift(activeBranch);
      }
      this.populateBranchSelect(branchNames, activeBranch);

      const searchDurationMs = Math.round(performance.now() - searchStartTime);
      this.renderFiles(parsed.owner, parsed.repo, activeBranch, treeResult.data.tree, Boolean(treeResult.data.truncated), searchDurationMs);
    } catch (err) {
      if (err.name === 'AbortError') return;
      const genericMsg = err.message || this.i18n.errGenericUnexpected;
      this.showErrorBanner(genericMsg);
      ToastNotificationAdapter.showError({
        title: this.lang === 'pt-BR' ? 'Exceção não tratada na busca' : (this.lang === 'es' ? 'Excepción no controlada en la búsqueda' : 'Unhandled search exception'),
        friendlyMessage: genericMsg,
        operation: 'Search Pipeline',
        target: parsed.owner + '/' + parsed.repo,
        endpoint: 'N/A',
        status: 'Client Exception',
        apiMessage: err.stack || err.message,
        rateLimit: null,
        lang: this.lang,
      });
    } finally {
      if (!signal.aborted) {
        this.setSearchLoading(false);
      }
    }
  }

  populateBranchSelect(branchNames, activeBranch) {
    if (!this.dom.branchSelect) return;
    this.dom.branchSelect.replaceChildren();
    for (let i = 0; i < branchNames.length; i += 1) {
      const name = branchNames[i];
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === activeBranch) {
        option.selected = true;
      }
      this.dom.branchSelect.appendChild(option);
    }
    this.dom.branchSelect.value = activeBranch;
    this.dom.branchSelect.disabled = false;
  }

  async handleBranchChange() {
    if (!this.currentRepoContext) return;
    const newBranch = this.dom.branchSelect ? this.dom.branchSelect.value : null;
    if (!newBranch || newBranch === this.currentRepoContext.branch) return;

    if (this.activeGenerationAbortController) {
      this.activeGenerationAbortController.abort();
      this.activeGenerationAbortController = null;
    }

    if (this.activeSearchAbortController) {
      this.activeSearchAbortController.abort();
    }
    this.activeSearchAbortController = new AbortController();
    const signal = this.activeSearchAbortController.signal;

    const previousBranch = this.currentRepoContext.branch;
    const { owner, repo } = this.currentRepoContext;

    this.setSearchLoading(true);
    if (this.dom.branchSelect) {
      this.dom.branchSelect.disabled = true;
    }
    const branchSwitchStartTime = performance.now();

    try {
      const treeResult = await GitHubClient.fetchGitTrees(owner, repo, newBranch, signal, this.lang);
      if (!treeResult.ok) {
        if (this.dom.branchSelect) {
          this.dom.branchSelect.value = previousBranch;
          this.dom.branchSelect.disabled = false;
        }
        this.showErrorBanner(treeResult.friendlyMessage);
        ToastNotificationAdapter.showError({
          title: this.i18n.toastBranchSwitchError || 'Erro ao alternar branch',
          friendlyMessage: treeResult.friendlyMessage,
          operation: 'GitHub Git Trees API (Branch Switch)',
          target: owner + '/' + repo + ' (' + newBranch + ')',
          endpoint: treeResult.endpoint,
          status: treeResult.status,
          apiMessage: treeResult.apiMessage,
          rateLimit: treeResult.rateLimit,
          lang: this.lang,
        });
        return;
      }

      const durationMs = Math.round(performance.now() - branchSwitchStartTime);
      this.renderFiles(owner, repo, newBranch, treeResult.data.tree, Boolean(treeResult.data.truncated), durationMs);

      if (this.dom.branchSelect) {
        this.dom.branchSelect.value = newBranch;
        this.dom.branchSelect.disabled = false;
      }

      ToastNotificationAdapter.showSuccess(
        this.i18n.toastBranchSwitchTitle,
        this.i18n.toastBranchSwitchMessage(
          newBranch,
          this.currentRepoContext.files.length.toLocaleString(this.i18n.locale),
          this.currentRepoContext.selectedTextCount.toLocaleString(this.i18n.locale),
          this.currentRepoContext.selectedRefCount.toLocaleString(this.i18n.locale)
        )
      );
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (this.dom.branchSelect) {
        this.dom.branchSelect.value = previousBranch;
        this.dom.branchSelect.disabled = false;
      }
      const genericMsg = err.message || this.i18n.errGenericUnexpected;
      this.showErrorBanner(genericMsg);
      ToastNotificationAdapter.showError({
        title: this.i18n.toastBranchSwitchError || 'Erro ao alternar branch',
        friendlyMessage: genericMsg,
        operation: 'Branch Switch Pipeline',
        target: owner + '/' + repo + ' (' + newBranch + ')',
        endpoint: 'N/A',
        status: 'Client Exception',
        apiMessage: err.stack || err.message,
        rateLimit: null,
        lang: this.lang,
      });
    } finally {
      if (!signal.aborted) {
        this.setSearchLoading(false);
        if (this.dom.branchSelect) {
          this.dom.branchSelect.disabled = false;
        }
      }
    }
  }

  renderFiles(owner, repo, branch, treeItems, isTruncated, durationMs = 0) {
    const rawFiles = (treeItems || []).filter((item) => item.type === 'blob');
    const total = rawFiles.length;

    const savedPreferences = StorageAdapter.getRepoPreferences(owner, repo, branch);
    const hasCustomPreferences = Boolean(savedPreferences && typeof savedPreferences === 'object');

    const selectedFlags = new Uint8Array(total);
    const modeFlags = new Uint8Array(total);
    const initialModes = new Uint8Array(total);
    const initialReasons = new Array(total);

    let selectedCount = 0;
    let selectedTextCount = 0;
    let selectedRefCount = 0;
    let totalTextCount = 0;
    let totalRefCount = 0;

    for (let i = 0; i < total; i += 1) {
      const file = rawFiles[i];
      const classification = classifyInitialFile(file, this.lang, this.i18n);
      const isInitialRef = classification.mode === 'reference';

      initialModes[i] = isInitialRef ? 1 : 0;
      initialReasons[i] = classification.reason;

      let isSelected = true;
      let isRef = isInitialRef;

      if (hasCustomPreferences && savedPreferences[file.path]) {
        const pref = savedPreferences[file.path];
        if (typeof pref.selected === 'boolean') {
          isSelected = pref.selected;
        }
        if (pref.mode === 'reference' || pref.mode === 'text') {
          isRef = pref.mode === 'reference';
        }
      }

      const selVal = isSelected ? 1 : 0;
      const modeVal = isRef ? 1 : 0;

      selectedFlags[i] = selVal;
      modeFlags[i] = modeVal;

      if (selVal === 1) {
        selectedCount += 1;
        if (modeVal === 1) {
          selectedRefCount += 1;
        } else {
          selectedTextCount += 1;
        }
      }

      if (modeVal === 1) {
        totalRefCount += 1;
      } else {
        totalTextCount += 1;
      }
    }

    this.currentRepoContext = {
      owner,
      repo,
      branch,
      files: rawFiles,
      selectedFlags,
      modeFlags,
      initialModes,
      initialReasons,
      selectedCount,
      selectedTextCount,
      selectedRefCount,
      totalTextCount,
      totalRefCount,
    };

    if (this.dom.repoTitle) {
      this.dom.repoTitle.textContent = owner + '/' + repo;
    }

    if (this.dom.fileCount) {
      this.dom.fileCount.textContent = this.i18n.filesListedBadge(total.toLocaleString(this.i18n.locale));
    }

    if (this.dom.truncatedWarning) {
      this.dom.truncatedWarning.hidden = !isTruncated;
    }

    if (this.dom.fileFilterInput) {
      this.dom.fileFilterInput.value = '';
    }
    this.activeFilterQuery = '';
    this.matchingIndices = [];
    this.currentMatchPointer = -1;
    if (this.dom.filterFeedback) {
      this.dom.filterFeedback.textContent = '';
      this.dom.filterFeedback.hidden = true;
    }

    if (this.dom.statusContainer) {
      this.dom.statusContainer.replaceChildren();
    }
    if (this.dom.emptyState) {
      this.dom.emptyState.hidden = true;
    }
    if (this.dom.resultsSection) {
      this.dom.resultsSection.hidden = false;
    }

    if (this.dom.fileList) {
      this.dom.fileList.replaceChildren();

      const fragment = document.createDocumentFragment();

      for (let i = 0; i < total; i += 1) {
        const file = rawFiles[i];
        const classification = classifyInitialFile(file, this.lang, this.i18n);
        const isSelected = selectedFlags[i] === 1;
        const isRef = modeFlags[i] === 1;
        const isScrap = !isRef;
        const modeLabel = isScrap ? this.i18n.modeScrap : this.i18n.modeRef;

        const li = document.createElement('li');
        li.className = 'file-item' + (isSelected ? '' : ' file-item-unselected');
        li.dataset.index = String(i);

        const checkboxLabel = document.createElement('label');
        checkboxLabel.className = 'file-checkbox-label';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        checkbox.checked = isSelected;
        checkbox.dataset.index = String(i);
        checkbox.setAttribute('aria-label', file.path);

        checkboxLabel.appendChild(checkbox);

        const pathWrapper = document.createElement('div');
        pathWrapper.className = 'file-path-group';

        const code = document.createElement('code');
        code.className = 'file-path';
        code.textContent = file.path;
        pathWrapper.appendChild(code);

        if (classification.badgeText) {
          const badge = document.createElement('span');
          badge.className = 'file-badge ' + classification.badgeClass;
          badge.textContent = classification.badgeText;
          pathWrapper.appendChild(badge);
        }

        const meta = document.createElement('div');
        meta.className = 'file-meta';

        const typeBadge = document.createElement('span');
        typeBadge.className = 'file-type-badge';
        const typeText = getFileType(file.path, this.lang, this.i18n);
        typeBadge.textContent = typeText;
        typeBadge.title = typeText;
        typeBadge.setAttribute('aria-label', this.i18n.colType + ': ' + typeText);

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        const formattedSize = formatFileSize(file.size, this.lang);
        sizeSpan.textContent = formattedSize;
        sizeSpan.setAttribute('aria-label', this.i18n.colSize + ': ' + formattedSize);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.setAttribute('role', 'switch');
        toggleBtn.className = 'mode-toggle';
        toggleBtn.dataset.index = String(i);
        toggleBtn.setAttribute('aria-checked', String(isScrap));
        toggleBtn.setAttribute('aria-label', file.path + ': ' + modeLabel);

        const track = document.createElement('span');
        track.className = 'toggle-track';
        track.setAttribute('aria-hidden', 'true');

        const thumb = document.createElement('span');
        thumb.className = 'toggle-thumb';
        track.appendChild(thumb);

        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'toggle-label';
        toggleLabel.textContent = modeLabel;

        toggleBtn.append(track, toggleLabel);

        meta.append(typeBadge, sizeSpan, toggleBtn);
        li.append(checkboxLabel, pathWrapper, meta);
        fragment.appendChild(li);
      }

      this.dom.fileList.appendChild(fragment);
    }

    if (this.dom.selectAllCheckbox) {
      this.syncSelectAllCheckbox();
    }

    this.updateMasterToggleState();
    this.updateGenerateButtonState();

    const restoredSuffix = hasCustomPreferences ? this.i18n.toastRepoSuccessRestored : '';
    ToastNotificationAdapter.showSuccess(
      this.i18n.toastRepoSuccessTitle + restoredSuffix,
      this.i18n.toastRepoSuccessMessage(
        owner,
        repo,
        branch,
        total.toLocaleString(this.i18n.locale),
        selectedTextCount.toLocaleString(this.i18n.locale),
        selectedRefCount.toLocaleString(this.i18n.locale),
        durationMs
      )
    );
  }

  handleFileListChange(event) {
    const target = event.target;
    if (!this.currentRepoContext) return;

    if (target.matches('.file-checkbox')) {
      const index = Number(target.dataset.index);
      if (!Number.isNaN(index)) {
        this.handleCheckboxToggle(index, target.checked);
      }
    }
  }

  handleFileListClick(event) {
    if (!this.currentRepoContext || !event || !event.target || !event.target.closest) return;

    const toggleBtn = event.target.closest('.mode-toggle');
    if (toggleBtn) {
      const index = Number(toggleBtn.dataset.index);
      if (!Number.isNaN(index)) {
        this.handleRowToggleClick(index, toggleBtn);
      }
      return;
    }

    if (event.target.closest('.file-checkbox') || event.target.closest('.file-checkbox-label')) {
      return;
    }

    const item = event.target.closest('.file-item');
    if (!item) return;

    const index = Number(item.dataset.index);
    if (Number.isNaN(index)) return;

    const checkbox = item.querySelector('.file-checkbox');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      this.handleCheckboxToggle(index, checkbox.checked);
    }
  }

  handleFilterInput() {
    if (!this.currentRepoContext) return;
    const rawValue = this.dom.fileFilterInput ? this.dom.fileFilterInput.value : '';
    const query = rawValue.trim().toLowerCase();
    this.activeFilterQuery = query;

    const files = this.currentRepoContext.files;
    const items = this.dom.fileList ? this.dom.fileList.children : [];
    const total = files.length;

    for (let i = 0; i < total; i += 1) {
      const item = items[i];
      if (item) {
        item.classList.remove('file-item-match', 'file-item-active-match');
      }
    }

    if (!query) {
      this.matchingIndices = [];
      this.currentMatchPointer = -1;
      if (this.dom.filterFeedback) {
        this.dom.filterFeedback.textContent = '';
        this.dom.filterFeedback.hidden = true;
      }
      return;
    }

    const matches = [];
    for (let i = 0; i < total; i += 1) {
      if (files[i].path.toLowerCase().includes(query)) {
        matches.push(i);
        const item = items[i];
        if (item) {
          item.classList.add('file-item-match');
        }
      }
    }

    this.matchingIndices = matches;

    if (matches.length > 0) {
      this.currentMatchPointer = 0;
      this.highlightActiveMatch(matches, 0);
    } else {
      this.currentMatchPointer = -1;
      if (this.dom.filterFeedback) {
        this.dom.filterFeedback.textContent = this.lang === 'pt-BR'
          ? '0 ocorrências'
          : (this.lang === 'es' ? '0 coincidencias' : '0 matches');
        this.dom.filterFeedback.hidden = false;
      }
    }
  }

  highlightActiveMatch(matches, pointer) {
    const items = this.dom.fileList ? this.dom.fileList.children : [];
    for (let i = 0; i < matches.length; i += 1) {
      const item = items[matches[i]];
      if (item) {
        item.classList.remove('file-item-active-match');
      }
    }

    if (pointer >= 0 && pointer < matches.length) {
      const targetIndex = matches[pointer];
      const activeItem = items[targetIndex];
      if (activeItem) {
        activeItem.classList.add('file-item-active-match');
        if (typeof activeItem.scrollIntoView === 'function') {
          activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      if (this.dom.filterFeedback) {
        this.dom.filterFeedback.textContent = (pointer + 1) + ' / ' + matches.length;
        this.dom.filterFeedback.hidden = false;
      }
    }
  }

  handleFilterKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const matches = this.matchingIndices;
    if (!matches || matches.length === 0) return;

    if (event.shiftKey) {
      this.currentMatchPointer -= 1;
      if (this.currentMatchPointer < 0) {
        this.currentMatchPointer = matches.length - 1;
      }
    } else {
      this.currentMatchPointer += 1;
      if (this.currentMatchPointer >= matches.length) {
        this.currentMatchPointer = 0;
      }
    }

    this.highlightActiveMatch(matches, this.currentMatchPointer);
  }

  clearFilter() {
    if (this.dom.fileFilterInput) {
      this.dom.fileFilterInput.value = '';
    }
    this.handleFilterInput();
    if (this.dom.fileFilterInput && typeof this.dom.fileFilterInput.focus === 'function') {
      this.dom.fileFilterInput.focus();
    }
  }

  saveCurrentRepoPreferences() {
    if (!this.currentRepoContext) return;
    const { owner, repo, branch, files, selectedFlags, modeFlags } = this.currentRepoContext;
    const preferences = {};
    for (let i = 0; i < files.length; i += 1) {
      preferences[files[i].path] = {
        selected: selectedFlags[i] === 1,
        mode: modeFlags[i] === 1 ? 'reference' : 'text',
      };
    }
    StorageAdapter.saveRepoPreferences(owner, repo, branch, preferences);
  }

  recalculateCounts() {
    if (!this.currentRepoContext) return;
    const { files, selectedFlags, modeFlags } = this.currentRepoContext;
    let selCount = 0;
    let selText = 0;
    let selRef = 0;
    let totText = 0;
    let totRef = 0;

    for (let i = 0; i < files.length; i += 1) {
      const isSel = selectedFlags[i] === 1;
      const isRef = modeFlags[i] === 1;

      if (isRef) {
        totRef += 1;
      } else {
        totText += 1;
      }

      if (isSel) {
        selCount += 1;
        if (isRef) {
          selRef += 1;
        } else {
          selText += 1;
        }
      }
    }

    this.currentRepoContext.selectedCount = selCount;
    this.currentRepoContext.selectedTextCount = selText;
    this.currentRepoContext.selectedRefCount = selRef;
    this.currentRepoContext.totalTextCount = totText;
    this.currentRepoContext.totalRefCount = totRef;
  }

  handleCheckboxToggle(index, isChecked) {
    const val = isChecked ? 1 : 0;
    if (this.currentRepoContext.selectedFlags[index] === val) return;

    this.currentRepoContext.selectedFlags[index] = val;
    this.recalculateCounts();

    const item = this.dom.fileList ? this.dom.fileList.children[index] : null;
    if (item) {
      item.classList.toggle('file-item-unselected', !isChecked);
    }

    this.syncSelectAllCheckbox();
    this.updateGenerateButtonState();
    this.saveCurrentRepoPreferences();
  }

  handleRowToggleClick(index, toggleBtn) {
    if (!this.currentRepoContext) return;
    const currentMode = this.currentRepoContext.modeFlags[index];
    const newMode = currentMode === 0 ? 1 : 0;
    const isScrap = newMode === 0;
    const newLabel = isScrap ? this.i18n.modeScrap : this.i18n.modeRef;

    this.currentRepoContext.modeFlags[index] = newMode;

    toggleBtn.setAttribute('aria-checked', String(isScrap));
    toggleBtn.setAttribute('aria-label', this.currentRepoContext.files[index].path + ': ' + newLabel);

    const labelSpan = toggleBtn.querySelector('.toggle-label');
    if (labelSpan) {
      labelSpan.textContent = newLabel;
    }

    this.recalculateCounts();
    this.updateMasterToggleState();
    this.updateGenerateButtonState();
    this.saveCurrentRepoPreferences();
  }

  handleMasterModeToggle() {
    if (!this.currentRepoContext) return;
    const currentAttr = this.dom.masterModeToggle.getAttribute('aria-checked');
    const isCurrentlyScrap = currentAttr === 'true';
    const newScrap = !isCurrentlyScrap;
    const newMode = newScrap ? 0 : 1;
    const labelVal = newScrap ? this.i18n.modeScrap : this.i18n.modeRef;

    const total = this.currentRepoContext.files.length;
    this.currentRepoContext.modeFlags.fill(newMode);

    const items = this.dom.fileList ? this.dom.fileList.children : [];
    for (let i = 0; i < total; i += 1) {
      const item = items[i];
      if (!item) continue;
      const btn = item.querySelector('.mode-toggle');
      if (btn) {
        btn.setAttribute('aria-checked', String(newScrap));
        btn.setAttribute('aria-label', this.currentRepoContext.files[i].path + ': ' + labelVal);
        const lSpan = btn.querySelector('.toggle-label');
        if (lSpan) lSpan.textContent = labelVal;
      }
    }

    this.dom.masterModeToggle.setAttribute('aria-checked', String(newScrap));
    const masterLabel = this.dom.masterModeToggle.querySelector('.toggle-label');
    if (masterLabel) {
      masterLabel.textContent = labelVal;
    }

    this.recalculateCounts();
    this.updateGenerateButtonState();
    this.saveCurrentRepoPreferences();
  }

  updateMasterToggleState() {
    if (!this.currentRepoContext || !this.dom.masterModeToggle) return;
    const { totalRefCount, files } = this.currentRepoContext;
    const allRef = totalRefCount === files.length;
    const isScrap = !allRef;

    this.dom.masterModeToggle.setAttribute('aria-checked', String(isScrap));
    const masterLabel = this.dom.masterModeToggle.querySelector('.toggle-label');
    const labelVal = isScrap ? this.i18n.modeScrap : this.i18n.modeRef;
    if (masterLabel) {
      masterLabel.textContent = labelVal;
    }
  }

  syncSelectAllCheckbox() {
    if (!this.currentRepoContext || !this.dom.selectAllCheckbox) return;
    const total = this.currentRepoContext.files.length;
    if (total === 0) {
      this.dom.selectAllCheckbox.checked = false;
      this.dom.selectAllCheckbox.indeterminate = false;
      return;
    }

    const selected = this.currentRepoContext.selectedCount;

    if (selected === total) {
      this.dom.selectAllCheckbox.checked = true;
      this.dom.selectAllCheckbox.indeterminate = false;
    } else if (selected === 0) {
      this.dom.selectAllCheckbox.checked = false;
      this.dom.selectAllCheckbox.indeterminate = false;
    } else {
      this.dom.selectAllCheckbox.checked = false;
      this.dom.selectAllCheckbox.indeterminate = true;
    }
  }

  setAllSelection(selected) {
    if (!this.currentRepoContext) return;
    const total = this.currentRepoContext.files.length;
    const val = selected ? 1 : 0;
    const items = this.dom.fileList ? this.dom.fileList.children : [];

    this.currentRepoContext.selectedFlags.fill(val);

    for (let i = 0; i < total; i += 1) {
      const item = items[i];
      if (!item) continue;
      const checkbox = item.querySelector('.file-checkbox');
      if (checkbox) checkbox.checked = selected;
      item.classList.toggle('file-item-unselected', !selected);
    }

    this.recalculateCounts();
    this.syncSelectAllCheckbox();
    this.updateGenerateButtonState();
    this.saveCurrentRepoPreferences();
  }

  restoreSmartDefaults() {
    if (!this.currentRepoContext) return;
    const total = this.currentRepoContext.files.length;
    if (total === 0) return;

    const { owner, repo, branch, files } = this.currentRepoContext;
    StorageAdapter.clearRepoPreferences(owner, repo, branch);

    this.currentRepoContext.selectedFlags.fill(1);

    const items = this.dom.fileList ? this.dom.fileList.children : [];

    for (let i = 0; i < total; i += 1) {
      const file = files[i];
      const classification = classifyInitialFile(file, this.lang, this.i18n);
      const isRef = classification.mode === 'reference';
      const modeVal = isRef ? 1 : 0;

      this.currentRepoContext.modeFlags[i] = modeVal;

      const item = items[i];
      if (item) {
        const checkbox = item.querySelector('.file-checkbox');
        if (checkbox) checkbox.checked = true;
        item.classList.remove('file-item-unselected');

        const toggleBtn = item.querySelector('.mode-toggle');
        if (toggleBtn) {
          const isScrap = !isRef;
          const labelVal = isScrap ? this.i18n.modeScrap : this.i18n.modeRef;
          toggleBtn.setAttribute('aria-checked', String(isScrap));
          toggleBtn.setAttribute('aria-label', file.path + ': ' + labelVal);
          const lSpan = toggleBtn.querySelector('.toggle-label');
          if (lSpan) lSpan.textContent = labelVal;
        }
      }
    }

    this.recalculateCounts();
    this.syncSelectAllCheckbox();
    this.updateMasterToggleState();
    this.updateGenerateButtonState();

    ToastNotificationAdapter.showSuccess(
      this.i18n.toastSmartDefaultsTitle,
      this.i18n.toastSmartDefaultsMessage(
        total.toLocaleString(this.i18n.locale),
        this.currentRepoContext.selectedTextCount.toLocaleString(this.i18n.locale),
        this.currentRepoContext.selectedRefCount.toLocaleString(this.i18n.locale)
      )
    );
  }

  updateGenerateButtonState() {
    if (!this.currentRepoContext) return;

    const { owner, repo, branch, files, selectedFlags, modeFlags } = this.currentRepoContext;
    const metrics = calculateEstimatedDestinationMetrics(owner, repo, branch, files, selectedFlags, modeFlags, this.lang, this.i18n);

    const hasSelection = metrics.selectedCount > 0;
    const isBusy = Boolean(this.activeGenerationAbortController);

    if (this.dom.selectionSummary) {
      if (hasSelection) {
        this.dom.selectionSummary.textContent = this.i18n.summarySelected(
          metrics.selectedCount.toLocaleString(this.i18n.locale),
          metrics.scrapCount.toLocaleString(this.i18n.locale),
          metrics.refCount.toLocaleString(this.i18n.locale),
          metrics.formattedSize,
          metrics.formattedTokens
        );
        this.dom.selectionSummary.hidden = false;
      } else {
        this.dom.selectionSummary.textContent = this.i18n.summaryZero;
        this.dom.selectionSummary.hidden = false;
      }
    }

    if (this.dom.generateButton) {
      this.dom.generateButton.disabled = !hasSelection || isBusy;
      if (hasSelection) {
        this.dom.generateButton.textContent = this.i18n.generateTxtBtnWithMetrics(
          metrics.selectedCount.toLocaleString(this.i18n.locale),
          metrics.scrapCount.toLocaleString(this.i18n.locale),
          metrics.refCount.toLocaleString(this.i18n.locale),
          metrics.formattedSize,
          metrics.formattedTokens
        );
      } else {
        this.dom.generateButton.textContent = this.i18n.generateTxtBtnZero;
      }
    }

    if (this.dom.generateZipButton) {
      this.dom.generateZipButton.disabled = !hasSelection || isBusy;
      if (hasSelection) {
        this.dom.generateZipButton.textContent = this.i18n.generateZipBtn + ' (' + metrics.selectedCount.toLocaleString(this.i18n.locale) + ')';
      } else {
        this.dom.generateZipButton.textContent = this.i18n.generateZipBtnZero;
      }
    }

    if (this.dom.previewButton) {
      this.dom.previewButton.disabled = !hasSelection || isBusy;
      if (hasSelection) {
        this.dom.previewButton.textContent = this.i18n.previewBtn + ' (' + metrics.selectedCount.toLocaleString(this.i18n.locale) + ')';
      } else {
        this.dom.previewButton.textContent = this.i18n.previewBtnZero;
      }
    }
  }

  updateGenerationProgress(completed, total, currentPath = '') {
    if (!this.dom.generationProgressContainer) return;
    this.dom.generationProgressContainer.hidden = false;

    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (this.dom.generationProgressBarFill) {
      this.dom.generationProgressBarFill.style.inlineSize = pct + '%';
    }
    if (this.dom.generationProgressbar) {
      this.dom.generationProgressbar.setAttribute('aria-valuenow', String(pct));
    }
    if (this.dom.progressStatusText) {
      const pathSuffix = currentPath ? ' - ' + currentPath : '';
      this.dom.progressStatusText.textContent = pct + '% (' + completed + '/' + total + ')' + pathSuffix;
    }
  }

  async compileSelectedText() {
    const { owner, repo, branch, files, selectedFlags, modeFlags } = this.currentRepoContext;
    const signal = this.activeGenerationAbortController ? this.activeGenerationAbortController.signal : null;

    const selectedFileIndices = [];
    for (let i = 0; i < files.length; i += 1) {
      if (selectedFlags[i] === 1) {
        selectedFileIndices.push(i);
      }
    }

    const totalSelected = selectedFileIndices.length;
    this.updateGenerationProgress(0, totalSelected, this.i18n.progressPreparing);

    const results = new Array(totalSelected);
    const downloadErrors = [];
    let completedCount = 0;

    const textQueue = [];
    for (let sIdx = 0; sIdx < totalSelected; sIdx += 1) {
      const fileIdx = selectedFileIndices[sIdx];
      const file = files[fileIdx];
      const isRef = modeFlags[fileIdx] === 1;

      if (isRef) {
        const urls = buildGitHubUrls(owner, repo, branch, file.path);
        results[sIdx] = {
          path: file.path,
          mode: 'reference',
          type: getFileType(file.path, this.lang, this.i18n),
          sizeFormatted: formatFileSize(file.size, this.lang),
          blobUrl: urls.blobUrl,
          rawUrl: urls.rawUrl,
        };
        completedCount += 1;
        this.updateGenerationProgress(completedCount, totalSelected, file.path);
      } else {
        textQueue.push({ sIdx, file });
      }
    }

    let queuePointer = 0;
    const concurrency = Math.min(6, textQueue.length);

    const worker = async () => {
      while (queuePointer < textQueue.length) {
        if (signal && signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const item = textQueue[queuePointer];
        queuePointer += 1;

        const urls = buildGitHubUrls(owner, repo, branch, item.file.path);
        this.updateGenerationProgress(completedCount, totalSelected, item.file.path);

        const blobFallback = { owner, repo, sha: item.file.sha };
        const downloadRes = await GitHubClient.downloadFileText(urls.rawUrl, signal, blobFallback);

        if (!downloadRes.ok) {
          downloadErrors.push({ path: item.file.path, status: downloadRes.status, statusText: downloadRes.statusText });
          results[item.sIdx] = {
            path: item.file.path,
            mode: 'reference',
            type: getFileType(item.file.path, this.lang, this.i18n),
            sizeFormatted: formatFileSize(item.file.size, this.lang),
            blobUrl: urls.blobUrl,
            rawUrl: urls.rawUrl,
          };
        } else {
          const textContent = downloadRes.content;
          if (containsNullBytes(textContent)) {
            results[item.sIdx] = {
              path: item.file.path,
              mode: 'reference',
              type: getFileType(item.file.path, this.lang, this.i18n),
              sizeFormatted: formatFileSize(item.file.size, this.lang),
              blobUrl: urls.blobUrl,
              rawUrl: urls.rawUrl,
            };
          } else {
            results[item.sIdx] = {
              path: item.file.path,
              mode: 'text',
              content: textContent,
            };
          }
        }

        completedCount += 1;
        this.updateGenerationProgress(completedCount, totalSelected, item.file.path);
      }
    };

    const workers = [];
    for (let w = 0; w < concurrency; w += 1) {
      workers.push(worker());
    }

    await Promise.all(workers);

    const compiledText = formatConcatenatedOutput(results, this.lang, this.i18n);
    return { compiledText, totalSelected, results, downloadErrors };
  }

  async executePreview() {
    if (!this.currentRepoContext || this.currentRepoContext.selectedCount === 0) {
      return;
    }

    if (this.activeGenerationAbortController) {
      this.activeGenerationAbortController.abort();
    }
    this.activeGenerationAbortController = new AbortController();

    this.updateGenerateButtonState();

    try {
      const { compiledText } = await this.compileSelectedText();
      const filename = this.currentRepoContext.repo + '.txt';
      const totalBytes = new TextEncoder().encode(compiledText).length;
      const formattedSize = formatFileSize(totalBytes, this.lang);

      this.openPreviewDialog(filename, formattedSize, compiledText);
    } catch (err) {
      if (err.name === 'AbortError') return;
      ToastNotificationAdapter.showError({
        title: this.lang === 'pt-BR' ? 'Erro na visualização' : (this.lang === 'es' ? 'Error en la vista previa' : 'Preview error'),
        friendlyMessage: err.message || this.i18n.errGenericUnexpected,
        operation: 'Preview Pipeline',
        target: this.currentRepoContext.owner + '/' + this.currentRepoContext.repo,
        endpoint: 'N/A',
        status: 'Client Execution Error',
        apiMessage: err.stack || err.message,
        rateLimit: null,
        lang: this.lang,
      });
    } finally {
      if (this.dom.generationProgressContainer) {
        this.dom.generationProgressContainer.hidden = true;
      }
      this.activeGenerationAbortController = null;
      this.updateGenerateButtonState();
    }
  }

  async executeGeneration() {
    if (!this.currentRepoContext || this.currentRepoContext.selectedCount === 0) {
      return;
    }

    if (this.activeGenerationAbortController) {
      this.activeGenerationAbortController.abort();
    }
    this.activeGenerationAbortController = new AbortController();

    const { owner, repo } = this.currentRepoContext;
    this.updateGenerateButtonState();
    const generationStartTime = performance.now();

    try {
      const { compiledText, totalSelected, results, downloadErrors } = await this.compileSelectedText();

      if (this.dom.progressStatusText) {
        this.dom.progressStatusText.textContent = this.i18n.progressProcessing;
      }

      const outputFilename = repo + '.txt';
      FileDownloadAdapter.triggerFileDownload(compiledText, outputFilename);

      const elapsedMs = Math.round(performance.now() - generationStartTime);
      const totalBytes = new TextEncoder().encode(compiledText).length;
      const formattedSize = formatFileSize(totalBytes, this.lang);

      let scrapFinalCount = 0;
      let refFinalCount = 0;
      for (let i = 0; i < results.length; i += 1) {
        if (results[i] && results[i].mode === 'reference') {
          refFinalCount += 1;
        } else {
          scrapFinalCount += 1;
        }
      }

      ToastNotificationAdapter.showSuccess(
        this.i18n.toastGeneratedTitle(outputFilename),
        this.i18n.toastGeneratedMessage(
          totalSelected.toLocaleString(this.i18n.locale),
          scrapFinalCount.toLocaleString(this.i18n.locale),
          refFinalCount.toLocaleString(this.i18n.locale),
          formattedSize,
          elapsedMs
        )
      );

      if (downloadErrors.length > 0) {
        ToastNotificationAdapter.showError({
          title: this.i18n.toastDownloadErrorsTitle,
          friendlyMessage: this.i18n.toastDownloadErrorsMessage(downloadErrors.length),
          operation: 'Raw File Download (Converted to Reference)',
          target: owner + '/' + repo,
          endpoint: 'raw.githubusercontent.com',
          status: 'Partial Download Failure',
          apiMessage: downloadErrors.map((e) => e.path + ' (' + e.status + ')').slice(0, 10).join(', '),
          rateLimit: null,
          lang: this.lang,
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      ToastNotificationAdapter.showError({
        title: this.lang === 'pt-BR' ? 'Erro na geração do arquivo' : (this.lang === 'es' ? 'Error en la generación del archivo' : 'File generation error'),
        friendlyMessage: err.message || this.i18n.errGenericUnexpected,
        operation: 'Compilation Pipeline',
        target: owner + '/' + repo,
        endpoint: 'N/A',
        status: 'Client Execution Error',
        apiMessage: err.stack || err.message,
        rateLimit: null,
        lang: this.lang,
      });
    } finally {
      if (this.dom.generationProgressContainer) {
        this.dom.generationProgressContainer.hidden = true;
      }
      this.activeGenerationAbortController = null;
      this.updateGenerateButtonState();
    }
  }

  async executeZipGeneration() {
    if (!this.currentRepoContext || this.currentRepoContext.selectedCount === 0) {
      return;
    }

    if (this.activeGenerationAbortController) {
      this.activeGenerationAbortController.abort();
    }
    this.activeGenerationAbortController = new AbortController();
    const signal = this.activeGenerationAbortController.signal;

    const { owner, repo, branch, files, selectedFlags, modeFlags } = this.currentRepoContext;

    const selectedFileIndices = [];
    for (let i = 0; i < files.length; i += 1) {
      if (selectedFlags[i] === 1) {
        selectedFileIndices.push(i);
      }
    }

    const totalSelected = selectedFileIndices.length;
    this.updateGenerateButtonState();

    const generationStartTime = performance.now();
    this.updateGenerationProgress(0, totalSelected, this.i18n.progressPreparing);

    const zipBuilder = new ZipBuilder();
    const downloadErrors = [];
    const refResults = [];
    let completedCount = 0;

    const scrapQueue = [];
    for (let sIdx = 0; sIdx < totalSelected; sIdx += 1) {
      const fileIdx = selectedFileIndices[sIdx];
      const file = files[fileIdx];
      const isRef = modeFlags[fileIdx] === 1;

      if (isRef) {
        const urls = buildGitHubUrls(owner, repo, branch, file.path);
        refResults.push({
          path: file.path,
          mode: 'reference',
          type: getFileType(file.path, this.lang, this.i18n),
          sizeFormatted: formatFileSize(file.size, this.lang),
          blobUrl: urls.blobUrl,
          rawUrl: urls.rawUrl,
        });
        completedCount += 1;
        this.updateGenerationProgress(completedCount, totalSelected, file.path);
      } else {
        scrapQueue.push(file);
      }
    }

    try {
      let queuePointer = 0;
      const concurrency = Math.min(6, scrapQueue.length);

      const worker = async () => {
        while (queuePointer < scrapQueue.length) {
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          const file = scrapQueue[queuePointer];
          queuePointer += 1;

          const urls = buildGitHubUrls(owner, repo, branch, file.path);
          this.updateGenerationProgress(completedCount, totalSelected, file.path);

          const blobFallback = { owner, repo, sha: file.sha };
          const downloadRes = await GitHubClient.downloadFileBinary(urls.rawUrl, signal, blobFallback);

          if (!downloadRes.ok) {
            downloadErrors.push({ path: file.path, status: downloadRes.status, statusText: downloadRes.statusText });
            refResults.push({
              path: file.path,
              mode: 'reference',
              type: getFileType(file.path, this.lang, this.i18n),
              sizeFormatted: formatFileSize(file.size, this.lang),
              blobUrl: urls.blobUrl,
              rawUrl: urls.rawUrl,
            });
          } else {
            await zipBuilder.addFile(file.path, downloadRes.content);
          }

          completedCount += 1;
          this.updateGenerationProgress(completedCount, totalSelected, file.path);
        }
      };

      const workers = [];
      for (let w = 0; w < concurrency; w += 1) {
        workers.push(worker());
      }

      await Promise.all(workers);

      if (refResults.length > 0) {
        const refFilename = this.lang === 'en' ? 'REFERENCES.txt' : 'REFERENCIAS.txt';
        const compiledRefsText = formatConcatenatedOutput(refResults, this.lang, this.i18n);
        const refBytes = new TextEncoder().encode(compiledRefsText);
        await zipBuilder.addFile(refFilename, refBytes);
      }

      if (this.dom.progressStatusText) {
        this.dom.progressStatusText.textContent = this.i18n.progressProcessing;
      }

      const zipBlob = zipBuilder.buildBlob();
      const outputFilename = repo + '.zip';

      FileDownloadAdapter.triggerFileDownload(zipBlob, outputFilename);

      const elapsedMs = Math.round(performance.now() - generationStartTime);
      const formattedSize = formatFileSize(zipBlob.size, this.lang);
      const scrapDownloadedCount = totalSelected - refResults.length;

      ToastNotificationAdapter.showSuccess(
        this.i18n.toastZipGeneratedTitle(outputFilename),
        this.i18n.toastZipGeneratedMessage(
          totalSelected.toLocaleString(this.i18n.locale),
          scrapDownloadedCount.toLocaleString(this.i18n.locale),
          refResults.length.toLocaleString(this.i18n.locale),
          formattedSize,
          elapsedMs
        )
      );

      if (downloadErrors.length > 0) {
        ToastNotificationAdapter.showError({
          title: this.i18n.toastDownloadErrorsTitle,
          friendlyMessage: this.i18n.toastDownloadErrorsMessage(downloadErrors.length),
          operation: 'Raw File Binary Download (Converted to References)',
          target: owner + '/' + repo,
          endpoint: 'raw.githubusercontent.com',
          status: 'Partial Download Failure',
          apiMessage: downloadErrors.map((e) => e.path + ' (' + e.status + ')').slice(0, 10).join(', '),
          rateLimit: null,
          lang: this.lang,
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      ToastNotificationAdapter.showError({
        title: this.lang === 'pt-BR' ? 'Erro na geração do ZIP' : (this.lang === 'es' ? 'Error en la generación del ZIP' : 'ZIP generation error'),
        friendlyMessage: err.message || this.i18n.errGenericUnexpected,
        operation: 'ZIP Compilation Pipeline',
        target: owner + '/' + repo,
        endpoint: 'N/A',
        status: 'Client Execution Error',
        apiMessage: err.stack || err.message,
        rateLimit: null,
        lang: this.lang,
      });
    } finally {
      if (this.dom.generationProgressContainer) {
        this.dom.generationProgressContainer.hidden = true;
      }
      this.activeGenerationAbortController = null;
      this.updateGenerateButtonState();
    }
  }
}

export const ApplicationController = DomController;
