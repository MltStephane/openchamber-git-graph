import { expect, test } from 'bun:test';

import { diffLines } from '../src/panel/diff-lines.ts';

test('colors patch changes only inside hunks and preserves all text, even when truncated', () => {
  const patch = [
    ' file | 2 +-',
    '',
    'diff --git a/file b/file',
    '--- a/file',
    '+++ b/file',
    '@@ -1,2 +1,2 @@',
    ' context',
    '--- removed content',
    '+++ added content',
    '\\ No newline at end of file',
    'diff --git a/other b/other',
    '--- a/other',
    '+++ b/other',
    '@@ -1 +1 @@',
    '-old',
    '+part of a line',
  ].join('\n');
  const lines = diffLines(patch);
  expect(lines.map(({ kind }) => kind)).toEqual([
    'plain', 'plain', 'file', 'plain', 'plain', 'hunk', 'plain', 'removed', 'added',
    'plain', 'file', 'plain', 'plain', 'hunk', 'removed', 'added',
  ]);
  expect(lines.map(({ text }) => text).join('')).toBe(patch);
});
