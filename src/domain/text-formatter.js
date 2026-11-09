export const SEPARATOR = '='.repeat(80);

const LOCALE_MAP = {
  'pt-BR': 'pt-BR',
  'es': 'es-ES',
  'en': 'en-US',
};

const MODE_REF_SUFFIX_MAP = {
  'pt-BR': '[REFERÊNCIA]',
  'es': '[REFERENCIA]',
  'en': '[REFERENCE]',
};

const COL_TYPE_MAP = {
  'pt-BR': 'Tipo',
  'es': 'Tipo',
  'en': 'Type',
};

const COL_SIZE_MAP = {
  'pt-BR': 'Tamanho',
  'es': 'Tamaño',
  'en': 'Size',
};

const SINGLE_TOKEN_MAP = {
  'pt-BR': 'tokens',
  'es': 'tokens',
  'en': 'tokens',
};

export function formatFileSize(bytes, lang = 'en') {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '-';
  }

  if (bytes < 1024) {
    return bytes + ' B';
  }

  const locale = LOCALE_MAP[lang] || 'en-US';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted = size.toLocaleString(locale, {
    minimumFractionDigits: size < 10 && size % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: 1,
  });

  return formatted + ' ' + units[unitIndex];
}

export function formatTokenCount(tokens, lang = 'en') {
  const tokenUnit = SINGLE_TOKEN_MAP[lang] || 'tokens';
  const locale = LOCALE_MAP[lang] || 'en-US';

  if (typeof tokens !== 'number' || Number.isNaN(tokens) || tokens <= 0) {
    return '~0 ' + tokenUnit;
  }
  if (tokens < 1000) {
    return '~' + tokens.toLocaleString(locale) + ' ' + tokenUnit;
  }
  if (tokens < 1000000) {
    const val = tokens / 1000;
    const formatted = val.toLocaleString(locale, {
      minimumFractionDigits: val < 10 && val % 1 !== 0 ? 1 : 0,
      maximumFractionDigits: 1,
    });
    const unitStr = lang === 'en' ? 'k ' : ' mil ';
    return '~' + formatted + unitStr + tokenUnit;
  }
  const val = tokens / 1000000;
  const formatted = val.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const unitStr = lang === 'en' ? 'M ' : ' M ';
  return '~' + formatted + unitStr + tokenUnit;
}

export function formatTextBlock(filePath, content) {
  let normalizedContent = content ?? '';
  if (normalizedContent.length > 0 && !normalizedContent.endsWith('\n')) {
    normalizedContent += '\n';
  }
  return SEPARATOR + '\nFILE: ' + filePath + '\n' + SEPARATOR + '\n' + normalizedContent;
}

export function formatReferenceBlock(filePath, fileType, formattedSize, blobUrl, rawUrl, lang = 'en', i18n = null) {
  const modeRefSuffix = (i18n && i18n.modeRefSuffix) || MODE_REF_SUFFIX_MAP[lang] || '[REFERENCE]';
  const colType = (i18n && i18n.colType) || COL_TYPE_MAP[lang] || 'Type';
  const colSize = (i18n && i18n.colSize) || COL_SIZE_MAP[lang] || 'Size';

  return (
    SEPARATOR + '\n' +
    'FILE: ' + filePath + ' ' + modeRefSuffix + '\n' +
    SEPARATOR + '\n' +
    colType + ': ' + fileType + ' | ' + colSize + ': ' + formattedSize + '\n' +
    'URL: ' + blobUrl + '\n' +
    'Raw: ' + rawUrl + '\n'
  );
}

export function formatConcatenatedOutput(results, lang = 'en', i18n = null) {
  const blocks = [];
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i];
    if (!item) continue;
    if (item.mode === 'reference') {
      blocks.push(formatReferenceBlock(
        item.path,
        item.type,
        item.sizeFormatted,
        item.blobUrl,
        item.rawUrl,
        lang,
        i18n
      ));
    } else {
      blocks.push(formatTextBlock(
        item.path,
        item.content
      ));
    }
  }
  return blocks.join('\n');
}

export function buildDiagnosticReport(data, lang = 'en') {
  const locale = LOCALE_MAP[lang] || 'en-US';
  const lines = [
    '[DIAGNOSTIC REPORT - GITHUB SCRAP]',
    'Operation: ' + (data.operation || 'N/A'),
    'Target: ' + (data.target || 'N/A'),
    'Endpoint: ' + (data.endpoint || 'N/A'),
    'HTTP Status: ' + (data.status || 'N/A'),
    'API Message: ' + (data.apiMessage || 'N/A'),
    'Rate Limit: ' + (data.rateLimit || 'N/A'),
    'Timestamp: ' + (data.timestamp || new Date().toLocaleString(locale)),
    'Resolution: ' + (data.friendlyMessage || 'N/A'),
  ];
  return lines.join('\n');
}
