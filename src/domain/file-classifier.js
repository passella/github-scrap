import { buildGitHubUrls } from './repo-parser.js';
import { SEPARATOR, formatFileSize, formatTokenCount, formatReferenceBlock } from './text-formatter.js';

export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.tif', '.svgz',
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2', '.xz',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.m4a', '.flac', '.mov', '.avi', '.mkv',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.jar', '.pyc', '.pyo', '.wasm',
  '.sqlite', '.db', '.sqlite3', '.iso', '.dmg', '.apk', '.aab', '.dex'
]);

const NO_EXT_MAP = {
  'pt-BR': 'sem ext',
  'es': 'sin ext',
  'en': 'no ext',
};

const BADGE_BINARY_MAP = {
  'pt-BR': 'Binário',
  'es': 'Binario',
  'en': 'Binary',
};

export function isBinaryFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = filePath.slice(dotIndex).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      return true;
    }
  }
  return false;
}

export function containsNullBytes(text) {
  return typeof text === 'string' && text.includes('\0');
}

export function getFileType(filePath, lang = 'en', i18n = null) {
  if (!filePath || typeof filePath !== 'string') return '-';
  const filename = filePath.split('/').pop() || filePath;

  if (filename.startsWith('.') && !filename.slice(1).includes('.')) {
    return filename;
  }

  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex > 0) {
    return filename.slice(dotIndex).toLowerCase();
  }

  return (i18n && i18n.noExt) || NO_EXT_MAP[lang] || 'no ext';
}

export function classifyInitialFile(file, lang = 'en', i18n = null) {
  const isBinary = isBinaryFile(file.path);
  const isLarge = Boolean(file.size && file.size > 512000);

  if (isBinary) {
    return {
      mode: 'reference',
      reason: 'Binary file',
      badgeText: (i18n && i18n.badgeBinary) || BADGE_BINARY_MAP[lang] || 'Binary',
      badgeClass: 'file-badge-binary',
    };
  }

  if (isLarge) {
    return {
      mode: 'reference',
      reason: 'Large file > 500 KB',
      badgeText: (i18n && i18n.badgeLarge) || '> 500 KB',
      badgeClass: 'file-badge-large',
    };
  }

  return {
    mode: 'text',
    reason: '',
    badgeText: '',
    badgeClass: '',
  };
}

export function getUtf8ByteLength(str) {
  if (typeof str !== 'string') return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  return encodeURIComponent(str).replace(/%[A-F\d]{2}/g, 'U').length;
}

export function estimateScrapBlockSize(file) {
  const header = SEPARATOR + '\nFILE: ' + file.path + '\n' + SEPARATOR + '\n';
  return getUtf8ByteLength(header) + (file.size || 0) + 1;
}

export function estimateReferenceBlockSize(owner, repo, branch, file, lang = 'en', i18n = null) {
  const fileType = getFileType(file.path, lang, i18n);
  const formattedSize = formatFileSize(file.size, lang);
  const urls = buildGitHubUrls(owner, repo, branch, file.path);
  const refString = formatReferenceBlock(file.path, fileType, formattedSize, urls.blobUrl, urls.rawUrl, lang, i18n);
  return getUtf8ByteLength(refString);
}

export function calculateEstimatedDestinationMetrics(owner, repo, branch, files, selectedFlags, modeFlags, lang = 'en', i18n = null) {
  if (!files || !selectedFlags || !modeFlags) {
    return {
      selectedCount: 0,
      scrapCount: 0,
      refCount: 0,
      totalBytes: 0,
      formattedSize: '0 B',
      estimatedTokens: 0,
      formattedTokens: '~0 tokens',
    };
  }

  let totalBytes = 0;
  let selectedCount = 0;
  let scrapCount = 0;
  let refCount = 0;

  for (let i = 0; i < files.length; i += 1) {
    if (selectedFlags[i] === 1) {
      selectedCount += 1;
      if (modeFlags[i] === 0) {
        scrapCount += 1;
        totalBytes += estimateScrapBlockSize(files[i]);
      } else {
        refCount += 1;
        totalBytes += estimateReferenceBlockSize(owner, repo, branch, files[i], lang, i18n);
      }
    }
  }

  if (selectedCount > 1) {
    totalBytes += (selectedCount - 1);
  }

  const estimatedTokens = Math.ceil(totalBytes / 4);

  return {
    selectedCount,
    scrapCount,
    refCount,
    totalBytes,
    formattedSize: formatFileSize(totalBytes, lang),
    estimatedTokens,
    formattedTokens: formatTokenCount(estimatedTokens, lang),
  };
}
