import { afterEach, describe, expect, test } from 'bun:test';

import { DICTIONARIES, resolveLocale, setLocale, t } from '../src/panel/i18n.ts';

const shape = (dictionary: Record<string, string | object>) =>
  Object.entries(dictionary).map(([key, entry]) => [key, typeof entry === 'string' ? 'string' : Object.keys(entry).sort()]).sort();

afterEach(() => { setLocale('en'); });

describe('dictionaries', () => {
  test('French has the same keys and forms as English', () => {
    expect(shape(DICTIONARIES.fr)).toEqual(shape(DICTIONARIES.en));
  });
});

describe('resolveLocale', () => {
  test('exact tags are kept', () => {
    expect(resolveLocale('fr')).toBe('fr');
    expect(resolveLocale('en')).toBe('en');
  });

  test('a regional tag falls back to its base language', () => {
    expect(resolveLocale('fr-CA')).toBe('fr');
  });

  test('unknown or missing tags fall back to English', () => {
    expect(resolveLocale('pt-BR')).toBe('en');
    expect(resolveLocale('uk')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('t', () => {
  test('English plurals', () => {
    setLocale('en');
    expect([0, 1, 2].map((count) => t('head.changes', { count }))).toEqual(['0 changes', '1 change', '2 changes']);
  });

  test('French plurals', () => {
    setLocale('fr');
    expect([0, 1, 2].map((count) => t('head.changes', { count }))).toEqual(['0 modif', '1 modif', '2 modifs']);
  });

  test('placeholders are replaced by their parameter', () => {
    setLocale('fr');
    expect(t('copy.title', { hash: 'abc123' })).toBe('Copier abc123');
  });

  test('a placeholder without a parameter stays as it is', () => {
    expect(t('copy.title')).toBe('Copy {hash}');
    expect(t('common.labelled', { label: 'Tag' })).toBe('Tag: {value}');
  });
});
