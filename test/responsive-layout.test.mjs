import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('style.css defines responsive rules for all 8 target width breakpoints', () => {
  const cssPath = path.join(projectRoot, 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('@media (max-width: 359.98px)'));
  assert.ok(css.includes('@media (min-width: 360px) and (max-width: 413.98px)'));
  assert.ok(css.includes('@media (min-width: 414px) and (max-width: 639.98px)'));
  assert.ok(css.includes('@media (min-width: 640px) and (max-width: 899.98px)'));
  assert.ok(css.includes('@media (min-width: 900px) and (max-width: 1279.98px)'));
  assert.ok(css.includes('@media (min-width: 1280px) and (max-width: 1919.98px)'));
  assert.ok(css.includes('@media (min-width: 1920px) and (max-width: 2879.98px)'));
  assert.ok(css.includes('@media (min-width: 2880px)'));
});

test('style.css defines fluid tokens and clamps in root', () => {
  const cssPath = path.join(projectRoot, 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('--container-max-width'));
  assert.ok(css.includes('--preview-dialog-max-width'));
  assert.ok(css.includes('--font-size-base'));
  assert.ok(css.includes('--font-size-repo-title'));
  assert.ok(css.includes('clamp('));
  assert.ok(css.includes('scrollbar-gutter: stable;'));
});

test('Mobile rules prevent horizontal overflow and optimize touch layout', () => {
  const cssPath = path.join(projectRoot, 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.filter-input-wrapper'));
  assert.ok(css.includes('min-inline-size: 0;'));
  assert.ok(css.includes('#token-button-label'));
  assert.ok(css.includes('display: none;'));
  assert.ok(css.includes('.file-meta'));
  assert.ok(css.includes('justify-content: space-between;'));
  assert.ok(css.includes('.token-backup-row'));
  assert.ok(css.includes('flex-wrap: wrap;'));
});

test('Ultrawide and large screen rules constrain reading measure and scale dialogs', () => {
  const cssPath = path.join(projectRoot, 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('--container-max-width: 1560px;'));
  assert.ok(css.includes('--container-max-width: 1800px;'));
  assert.ok(css.includes('--preview-dialog-max-width: 1440px;'));
  assert.ok(css.includes('--preview-dialog-max-width: 1640px;'));
  assert.ok(css.includes('max-inline-size: 75ch;'));
});
