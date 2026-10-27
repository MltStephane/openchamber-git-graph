import { describe, expect, test } from 'bun:test';

import { parseDecorations, parseLog } from '../src/log-format.ts';

describe('parseDecorations', () => {
  test('current branch first, remote HEAD dropped, tags recognised', () => {
    expect(parseDecorations('refs/remotes/origin/main, HEAD -> refs/heads/main, refs/remotes/origin/HEAD, tag: refs/tags/v1.0')).toEqual([
      { name: 'main', kind: 'local', current: true },
      { name: 'origin/main', kind: 'remote', current: false },
      { name: 'v1.0', kind: 'tag', current: false },
    ]);
  });

  test('detached HEAD', () => {
    expect(parseDecorations('HEAD, refs/heads/feature/x')).toEqual([
      { name: 'HEAD', kind: 'head', current: true },
      { name: 'feature/x', kind: 'local', current: false },
    ]);
  });

  test('no decoration', () => {
    expect(parseDecorations('')).toEqual([]);
  });
});

describe('parseLog', () => {
  test('reads records separated by \\x1e with fields separated by \\x1f', () => {
    const out = [
      ['aaa', 'bbb ccc', 'HEAD -> refs/heads/main', 'Ada', '1700000000', 'Merge branch x'].join('\x1f'),
      ['bbb', '', '', 'Bob', '1690000000', 'Initial commit'].join('\x1f'),
    ].map((record) => `${record}\x1e\n`).join('');
    expect(parseLog(out)).toEqual([
      { hash: 'aaa', parents: ['bbb', 'ccc'], refs: [{ name: 'main', kind: 'local', current: true }], author: 'Ada', timestamp: 1700000000, subject: 'Merge branch x' },
      { hash: 'bbb', parents: [], refs: [], author: 'Bob', timestamp: 1690000000, subject: 'Initial commit' },
    ]);
  });
});
