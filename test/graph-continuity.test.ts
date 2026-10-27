import { describe, expect, test } from 'bun:test';

import { layoutGraph, type GraphCommit, type GraphRow } from '../src/graph.ts';

/** Lanes a row draws at its top edge and at its bottom edge. */
const edges = (row: GraphRow) => {
  const top = new Set<number>();
  const bottom = new Set<number>();
  for (const { type, fromLane, toLane } of row.connectors) {
    if (type === 'passing' || type === 'commit-lane') { top.add(fromLane); bottom.add(fromLane); }
    if (type === 'top-stub' || type === 'merge-in') top.add(fromLane);
    if (type === 'bottom-stub') bottom.add(fromLane);
    if (type === 'branch-out') bottom.add(toLane);
  }
  const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
  return { top: sorted(top), bottom: sorted(bottom) };
};

/** Every line leaving the bottom of a row enters the top of the next one, and nothing starts mid-air. */
export const expectContinuous = (commits: GraphCommit[]) => {
  const { rows } = layoutGraph(commits);
  expect(edges(rows[0]!).top).toEqual([]);
  for (let index = 1; index < rows.length; index++) {
    expect({ row: index, lanes: edges(rows[index]!).top }).toEqual({ row: index, lanes: edges(rows[index - 1]!).bottom });
  }
};

/** Deterministic pseudo-random generator (mulberry32). */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A random DAG listed newest first: commit i only points to commits after it. */
const randomHistory = (seed: number, size: number): GraphCommit[] => {
  const next = random(seed);
  return Array.from({ length: size }, (_, index) => {
    const parents: string[] = [];
    const roll = next();
    const count = index === size - 1 || roll < 0.05 ? 0 : roll < 0.8 ? 1 : roll < 0.95 ? 2 : 3;
    for (let p = 0; p < count; p++) {
      const target = index + 1 + Math.floor(next() * Math.min(8, size - index - 1));
      const hash = `c${target}`;
      if (!parents.includes(hash)) parents.push(hash);
    }
    return { hash: `c${index}`, parents };
  });
};

describe('layoutGraph continuity', () => {
  for (let seed = 1; seed <= 200; seed++) {
    test(`random history #${seed}`, () => expectContinuous(randomHistory(seed, 60)));
  }
});
