import { describe, expect, test } from 'bun:test';

import { layoutGraph, type Connector, type GraphCommit } from '../src/graph.ts';

const c = (hash: string, ...parents: string[]): GraphCommit => ({ hash, parents });
const lanes = (commits: GraphCommit[]) => layoutGraph(commits).rows.map((row) => row.lane);
const kinds = (connectors: Connector[], type: Connector['type']) =>
  connectors.filter((connector) => connector.type === type).map(({ fromLane, toLane }) => [fromLane, toLane]);

describe('layoutGraph', () => {
  test('empty history', () => {
    expect(layoutGraph([])).toEqual({ rows: [], width: 0 });
  });

  test('linear history stays in one lane', () => {
    const layout = layoutGraph([c('d', 'c'), c('c', 'b'), c('b', 'a'), c('a')]);
    expect(layout.width).toBe(1);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 0, 0, 0]);
    expect(layout.rows.map((row) => row.connectors.map((connector) => connector.type))).toEqual([
      ['bottom-stub'], ['commit-lane'], ['commit-lane'], ['top-stub'],
    ]);
  });

  test('branch and merge: first parent keeps the lane, the merged branch opens and closes one', () => {
    //  m      merge of f into main
    //  |\
    //  | f
    //  b |
    //  |/
    //  a
    const layout = layoutGraph([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')]);
    expect(layout.width).toBe(2);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 1, 0, 0]);
    const [merge, feature, main, base] = layout.rows;
    expect(kinds(merge!.connectors, 'branch-out')).toEqual([[0, 1]]);
    expect(kinds(merge!.connectors, 'passing')).toEqual([]); // the new lane starts below the dot
    expect(kinds(feature!.connectors, 'passing')).toEqual([[0, 0]]);
    expect(kinds(main!.connectors, 'passing')).toEqual([[1, 1]]);
    // Both lanes wait for `a`: lane 1 converges into lane 0 and closes.
    expect(kinds(base!.connectors, 'merge-in')).toEqual([[1, 0]]);
    expect(kinds(base!.connectors, 'top-stub')).toEqual([[0, 0]]);
  });

  test('branch tip that is not merged gets its own lane next to main', () => {
    // f is a branch tip newer than main's tip b; both fork from a.
    expect(lanes([c('f', 'a'), c('b', 'a'), c('a')])).toEqual([0, 1, 0]);
  });

  test('octopus merge opens one lane per extra parent and closes them all', () => {
    const layout = layoutGraph([c('o', 'a', 'x', 'y'), c('y', 'r'), c('x', 'r'), c('a', 'r'), c('r')]);
    expect(layout.width).toBe(3);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 2, 1, 0, 0]);
    expect(kinds(layout.rows[0]!.connectors, 'branch-out')).toEqual([[0, 1], [0, 2]]);
    expect(kinds(layout.rows[4]!.connectors, 'merge-in').sort()).toEqual([[1, 0], [2, 0]]);
  });

  test('merge parent already shown in another lane reuses that lane', () => {
    // m merges f, whose tip is already waited on by lane 1 (f2 has f as first parent).
    const layout = layoutGraph([c('f2', 'f'), c('m', 'a', 'f'), c('f', 'a'), c('a')]);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 1, 0, 0]);
    expect(kinds(layout.rows[1]!.connectors, 'branch-out')).toEqual([[1, 0]]);
    expect(layout.width).toBe(2);
  });

  test('multiple roots: each unrelated history ends its lane, freed lanes are reused', () => {
    //  b2 (lane 0) -> b1 root ; x2 (lane 1) -> x1 root ; later y1 root reuses lane 0
    const layout = layoutGraph([c('b2', 'b1'), c('x2', 'x1'), c('b1'), c('x1'), c('y1')]);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 1, 0, 1, 0]);
    expect(layout.rows[2]!.connectors.map((connector) => connector.type)).toEqual(['top-stub', 'passing']);
    expect(layout.rows[4]!.connectors).toEqual([]); // a lone root: just a dot
    expect(layout.width).toBe(2);
  });

  test('a merge joining two root histories', () => {
    const layout = layoutGraph([c('m', 'a', 'b'), c('b'), c('a')]);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 1, 0]);
    expect(layout.rows[1]!.connectors.map((connector) => connector.type)).toEqual(['top-stub', 'passing']);
  });

  test('parents beyond the loaded page keep their lanes open to the bottom', () => {
    const layout = layoutGraph([c('m', 'a', 'b'), c('b', 'zz')]);
    const last = layout.rows.at(-1)!;
    expect(last.connectors.map((connector) => connector.type).sort()).toEqual(['commit-lane', 'passing']);
  });

  test('deterministic: same input, same output', () => {
    const history = [c('m', 'b', 'f'), c('f', 'e'), c('e', 'a'), c('b', 'a'), c('t', 'a'), c('a')];
    expect(layoutGraph(history)).toEqual(layoutGraph([...history]));
  });
});
