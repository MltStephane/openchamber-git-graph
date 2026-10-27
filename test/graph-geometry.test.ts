import { describe, expect, test } from 'bun:test';

import type { Commit } from '../src/log-format.ts';
import { connectorPath, dotKind, graphWidth, LANE_COLORS, laneColor, MAX_LANES } from '../src/panel/graph-geometry.ts';

describe('connectorPath', () => {
  // Lane 0 is at x=9 and lane 1 at x=23; a row is 26 px high, its middle at 13.
  test('passing and commit-lane run straight over the full height', () => {
    expect(connectorPath({ fromLane: 1, toLane: 1, type: 'passing' })).toBe('M23 0 L23 26');
    expect(connectorPath({ fromLane: 0, toLane: 0, type: 'commit-lane' })).toBe('M9 0 L9 26');
  });

  test('stubs stop at the dot', () => {
    expect(connectorPath({ fromLane: 0, toLane: 0, type: 'top-stub' })).toBe('M9 0 L9 13');
    expect(connectorPath({ fromLane: 0, toLane: 0, type: 'bottom-stub' })).toBe('M9 13 L9 26');
  });

  test('branch-out curves from the dot down to the parent lane', () => {
    expect(connectorPath({ fromLane: 0, toLane: 1, type: 'branch-out' })).toBe('M9 13 C9 26 23 13 23 26');
  });

  test('merge-in curves from the top of another lane into the dot', () => {
    expect(connectorPath({ fromLane: 1, toLane: 0, type: 'merge-in' })).toBe('M23 0 C23 13 9 0 9 13');
  });
});

describe('graphWidth', () => {
  test('at least one lane wide', () => {
    expect(graphWidth(0)).toBe(graphWidth(1));
    expect(graphWidth(3)).toBe(46);
  });

  test('clipped at MAX_LANES', () => {
    expect(graphWidth(MAX_LANES + 5)).toBe(graphWidth(MAX_LANES));
    expect(graphWidth(MAX_LANES)).toBeGreaterThan(graphWidth(MAX_LANES - 1));
  });
});

describe('laneColor', () => {
  test('cycles through the palette', () => {
    expect(laneColor(0)).not.toBe(laneColor(1));
    expect(laneColor(LANE_COLORS.length)).toBe(laneColor(0));
    expect(laneColor(LANE_COLORS.length + 3)).toBe(laneColor(3));
  });
});

describe('dotKind', () => {
  const commit = (parents: string[], current = false): Commit =>
    ({ hash: 'h', parents, refs: current ? [{ name: 'main', kind: 'local', current: true }] : [{ name: 'v1', kind: 'tag', current: false }], author: '', timestamp: 0, subject: '' });

  test('a plain commit', () => {
    expect(dotKind(commit(['p']))).toBe('commit');
    expect(dotKind(commit([]))).toBe('commit');
  });

  test('a merge has more than one parent', () => {
    expect(dotKind(commit(['p1', 'p2']))).toBe('merge');
  });

  test('the checked-out commit is current, even when it is a merge', () => {
    expect(dotKind(commit(['p'], true))).toBe('current');
    expect(dotKind(commit(['p1', 'p2'], true))).toBe('current');
  });
});
