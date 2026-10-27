import { describe, expect, test } from 'bun:test';

import { headChange, type Head } from '../src/panel/watch.ts';

const HEAD: Head = { branch: 'master', sha: 'a'.repeat(40), dirty: false, changes: 0, refs: 'f1' };

describe('headChange', () => {
  test('without a previous head, the history is read', () => {
    expect(headChange(null, HEAD)).toBe('history');
  });

  test('moved refs (commit, branch, tag, fetch) reload the history', () => {
    expect(headChange(HEAD, { ...HEAD, refs: 'f2' })).toBe('history');
  });

  test('a moved HEAD reloads the history', () => {
    expect(headChange(HEAD, { ...HEAD, sha: 'b'.repeat(40) })).toBe('history');
  });

  test('a checkout on the same commit reloads the history', () => {
    expect(headChange(HEAD, { ...HEAD, branch: 'feature' })).toBe('history');
    expect(headChange(HEAD, { ...HEAD, branch: null })).toBe('history');
  });

  test('working tree changes only redraw the header line', () => {
    expect(headChange(HEAD, { ...HEAD, dirty: true, changes: 2 })).toBe('head');
    expect(headChange({ ...HEAD, dirty: true, changes: 2 }, { ...HEAD, dirty: true, changes: 3 })).toBe('head');
  });

  test('an unchanged repository redraws nothing', () => {
    expect(headChange(HEAD, { ...HEAD })).toBe('none');
  });
});
