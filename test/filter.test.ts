import { describe, expect, test } from 'bun:test';

import type { Commit } from '../src/log-format.ts';
import { filterCommits } from '../src/panel/filter.ts';

const commit = (subject: string, author: string): Commit => ({ hash: subject, parents: [], refs: [], author, timestamp: 0, subject });
const HISTORY = [commit('Fix login', 'Ada'), commit('Add graph', 'Bob'), commit('fix typo', 'ada')];
const indexes = (query: string) => filterCommits(HISTORY, query).matches.map(({ index }) => index);

describe('filterCommits', () => {
  test('an empty or blank query keeps every commit and is not active', () => {
    for (const query of ['', '   ', '\t']) {
      const result = filterCommits(HISTORY, query);
      expect(result.active).toBe(false);
      expect(result.matches.map(({ index }) => index)).toEqual([0, 1, 2]);
    }
  });

  test('matches the subject regardless of case', () => {
    expect(indexes('FIX')).toEqual([0, 2]);
    expect(indexes('Graph')).toEqual([1]);
  });

  test('matches the author regardless of case', () => {
    expect(indexes('ADA')).toEqual([0, 2]);
    expect(indexes('bob')).toEqual([1]);
  });

  test('surrounding spaces are ignored and the filter is active', () => {
    const result = filterCommits(HISTORY, '  graph ');
    expect(result.active).toBe(true);
    expect(result.matches.map(({ index }) => index)).toEqual([1]);
  });

  test('each match keeps the commit and its index in the full list', () => {
    const [match] = filterCommits(HISTORY, 'typo').matches;
    expect(match?.commit).toBe(HISTORY[2]!);
    expect(match?.index).toBe(2);
  });

  test('no match leaves an active filter with nothing', () => {
    expect(filterCommits(HISTORY, 'zzz')).toEqual({ active: true, matches: [] });
  });
});
