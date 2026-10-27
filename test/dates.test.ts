import { describe, expect, test } from 'bun:test';

import { absoluteDate, relativeDate } from '../src/panel/dates.ts';

/** 2023-11-14T22:13:20Z, in milliseconds. */
const NOW = 1_700_000_000_000;
const at = (secondsFromNow: number) => NOW / 1000 + secondsFromNow;
/** What Intl prints for that value and unit, so the test pins the unit choice, not the ICU wording. */
const intl = (locale: string, value: number, unit: Intl.RelativeTimeFormatUnit) =>
  new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(value, unit);

describe('relativeDate', () => {
  test('under a minute: seconds', () => {
    expect(relativeDate(at(-30), 'en', NOW)).toBe(intl('en', -30, 'second'));
  });

  test('a minute and a half rounds to one minute', () => {
    expect(relativeDate(at(-90), 'en', NOW)).toBe(intl('en', -1, 'minute'));
  });

  test('hours', () => {
    expect(relativeDate(at(-7_200), 'en', NOW)).toBe(intl('en', -2, 'hour'));
  });

  test('a day ago is "yesterday"', () => {
    expect(relativeDate(at(-86_400), 'en', NOW)).toBe('yesterday');
  });

  test('a week, a month, a year', () => {
    expect(relativeDate(at(-604_800), 'en', NOW)).toBe(intl('en', -1, 'week'));
    expect(relativeDate(at(-2_592_000), 'en', NOW)).toBe(intl('en', -1, 'month'));
    expect(relativeDate(at(-31_536_000), 'en', NOW)).toBe(intl('en', -1, 'year'));
  });

  test('a future date reads as "in …"', () => {
    expect(relativeDate(at(3_600), 'en', NOW)).toBe(intl('en', 1, 'hour'));
  });

  test('French', () => {
    expect(relativeDate(at(-86_400), 'fr', NOW)).toBe('hier');
    expect(relativeDate(at(-3_600), 'fr', NOW)).toBe(intl('fr', -1, 'hour'));
  });
});

describe('absoluteDate', () => {
  test('French medium date with the year', () => {
    const text = absoluteDate(NOW / 1000, 'fr');
    expect(text).toContain('2023');
    expect(text).toContain('nov.');
  });
});
