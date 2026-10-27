/**
 * Lane layout for the commit graph. Adapted from the SDK's `git-graph-status`
 * example (itself ported from OpenChamber's Git view).
 *
 * Input: commits newest first, every child before its parents (git's
 * `--topo-order` or `--date-order`). Output: one row per commit with the lane
 * of its dot and the connectors crossing that row.
 *
 * Rules, all deterministic:
 *  - A commit takes the leftmost lane waiting for it; a tip with no child takes
 *    the leftmost free lane.
 *  - Its first parent keeps that lane.
 *  - Every other parent (merge, octopus) reuses the lane already waiting for it,
 *    or opens the leftmost free lane.
 *  - Other lanes waiting for the same commit converge into it and close.
 *  - A root commit closes its lane.
 *
 * Each connector covers one row's full height:
 *  - `passing`     another lane runs straight through this row
 *  - `commit-lane` this commit's lane, with a child above and a parent below
 *  - `top-stub`    from the top to the dot (no parent: a root commit)
 *  - `bottom-stub` from the dot to the bottom (no child above: a branch tip)
 *  - `branch-out`  curve from the dot down to a merge parent's lane
 *  - `merge-in`    curve from another lane above into the dot
 */
export type GraphCommit = {
  hash: string;
  parents: readonly string[];
};

export type ConnectorType = 'passing' | 'commit-lane' | 'top-stub' | 'bottom-stub' | 'branch-out' | 'merge-in';

export type Connector = {
  fromLane: number;
  toLane: number;
  type: ConnectorType;
};

export type GraphRow = {
  lane: number;
  connectors: Connector[];
};

export type GraphLayout = {
  rows: GraphRow[];
  /** Lanes the widest row needs. */
  width: number;
};

export const layoutGraph = (commits: readonly GraphCommit[]): GraphLayout => {
  // active[lane] is the hash that lane waits for below the current row, or null when free.
  const active: Array<string | null> = [];
  const rows: GraphRow[] = [];
  let width = 0;
  const freeLane = (): number => {
    const index = active.indexOf(null);
    if (index >= 0) return index;
    active.push(null);
    return active.length - 1;
  };

  for (const commit of commits) {
    const waiting = active.flatMap((expected, index) => (expected === commit.hash ? [index] : []));
    const lane = waiting[0] ?? freeLane();
    const hasIncoming = waiting.length > 0;
    const hasParent = commit.parents.length > 0;
    active[lane] = commit.parents[0] ?? null;

    // Every other lane waiting for this commit converges into it.
    const convergingLanes = waiting.slice(1);
    const extraLanes: number[] = [];
    const newExtraLanes = new Set<number>();
    // Converging lanes close before merge parents look for a free lane, so an
    // octopus can reuse them on the same row.
    for (const converging of convergingLanes) active[converging] = null;
    for (const parent of commit.parents.slice(1)) {
      const existing = active.indexOf(parent);
      if (existing >= 0 && !newExtraLanes.has(existing) && existing !== lane) {
        extraLanes.push(existing);
        continue;
      }
      if (existing >= 0) continue; // the same parent listed twice
      const opened = freeLane();
      active[opened] = parent;
      extraLanes.push(opened);
      newExtraLanes.add(opened);
    }

    const connectors: Connector[] = [];
    if (hasIncoming && hasParent) connectors.push({ fromLane: lane, toLane: lane, type: 'commit-lane' });
    else if (hasIncoming) connectors.push({ fromLane: lane, toLane: lane, type: 'top-stub' });
    else if (hasParent) connectors.push({ fromLane: lane, toLane: lane, type: 'bottom-stub' });
    for (const converging of convergingLanes) connectors.push({ fromLane: converging, toLane: lane, type: 'merge-in' });
    for (const extra of extraLanes) connectors.push({ fromLane: lane, toLane: extra, type: 'branch-out' });
    // A reused merge parent already had a lane above, so it keeps its straight segment.
    // A lane opened on this row (even one a converging line just freed) only starts below the dot.
    active.forEach((expected, index) => {
      if (expected === null || index === lane || newExtraLanes.has(index)) return;
      connectors.push({ fromLane: index, toLane: index, type: 'passing' });
    });

    while (active.length > 0 && active[active.length - 1] === null) active.pop();
    for (const connector of connectors) width = Math.max(width, connector.fromLane + 1, connector.toLane + 1);
    width = Math.max(width, lane + 1);
    rows.push({ lane, connectors });
  }
  return { rows, width };
};
