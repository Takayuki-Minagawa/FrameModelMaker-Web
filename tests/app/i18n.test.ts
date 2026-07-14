// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadI18n(initialLanguage?: 'ja' | 'en') {
  localStorage.clear();
  if (initialLanguage) localStorage.setItem('lang', initialLanguage);
  vi.resetModules();
  return import('../../src/i18n');
}

describe('i18n', () => {
  beforeEach(() => {
    document.documentElement.lang = '';
  });

  it('initializes from the persisted language and translates known keys', async () => {
    const i18n = await loadI18n('en');
    expect(i18n.getLang()).toBe('en');
    expect(i18n.t('menu.file')).toBe('File');
  });

  it('switches language, persists the choice, and updates the document language', async () => {
    const i18n = await loadI18n('ja');
    i18n.setLang('en');

    expect(i18n.getLang()).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.t('theme.dark')).toBe('Dark');
  });

  it('interpolates each positional argument and returns unknown keys verbatim', async () => {
    const i18n = await loadI18n('en');
    expect(i18n.t('status.fileLoaded', 'frame.json', 12, 8))
      .toBe('Loaded: frame.json (Nodes:12 Members:8)');
    expect(i18n.t('unknown.translation.key')).toBe('unknown.translation.key');
  });
});
