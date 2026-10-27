// Sizes, colours and SVG paths of the graph, with no DOM: `view.ts` only turns them into nodes.
import type { Connector } from '../graph.ts';
import type { Commit } from '../log-format.ts';

/** Height of one commit row, in CSS px. The dot sits in its middle. */
export const ROW_HEIGHT = 26;
/** Distance between two lanes. */
const LANE_WIDTH = 14;
/** Lanes drawn at most; wider histories are clipped on the right. */
export const MAX_LANES = 24;
// One colour per lane, from the theme. Syntax tokens are optional in the snapshot,
// so each falls back to a semantic colour every host provides.
export const LANE_COLORS = [
  'var(--oc-syntax-keyword, var(--oc-primary))',
  'var(--oc-syntax-string, var(--oc-success))',
  'var(--oc-syntax-function, var(--oc-warning))',
  'var(--oc-syntax-type, var(--oc-info))',
  'var(--oc-syntax-number, var(--oc-error))',
  'var(--oc-primary)',
  'var(--oc-info)',
  'var(--oc-success)',
  'var(--oc-warning)',
  'var(--oc-error)',
];

export const laneX = (lane: number): number => LANE_WIDTH / 2 + 2 + lane * LANE_WIDTH;
export const laneColor = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length] ?? 'var(--oc-muted)';
export const graphWidth = (lanes: number): number => Math.min(Math.max(lanes, 1), MAX_LANES) * LANE_WIDTH + 4;

export type DotKind = 'commit' | 'merge' | 'current';

/** The checked-out commit wins over a merge: its dot shows where HEAD is. */
export const dotKind = (commit: Commit): DotKind =>
  commit.refs.some((ref) => ref.current) ? 'current' : commit.parents.length > 1 ? 'merge' : 'commit';

/**
 * SVG path of one connector over a row's full height; curves bend around the row's middle.
 * A `branch-out` leaves from the commit's lane (`fromLane`), a `merge-in` arrives in it (`toLane`).
 */
export const connectorPath = (connector: Connector): string => {
  const from = laneX(connector.fromLane);
  const to = laneX(connector.toLane);
  const mid = ROW_HEIGHT / 2;
  switch (connector.type) {
    case 'passing':
    case 'commit-lane':
      return `M${from} 0 L${from} ${ROW_HEIGHT}`;
    case 'top-stub':
      return `M${from} 0 L${from} ${mid}`;
    case 'bottom-stub':
      return `M${from} ${mid} L${from} ${ROW_HEIGHT}`;
    case 'branch-out':
      return `M${from} ${mid} C${from} ${ROW_HEIGHT} ${to} ${mid} ${to} ${ROW_HEIGHT}`;
    case 'merge-in':
      return `M${from} 0 C${from} ${mid} ${to} 0 ${to} ${mid}`;
  }
};
