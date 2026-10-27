import type { Head } from '../service-contract.ts';

/** What a new head asks the panel to redraw: the whole log, only the header line, or nothing. */
export type HeadChange = 'history' | 'head' | 'none';

// The current branch is drawn in the log (`HEAD → branch` badge): checking out a branch on the same commit moves no ref, yet it reloads the history.
export const headChange = (previous: Head | null, next: Head): HeadChange => {
  if (!previous || previous.refs !== next.refs || previous.sha !== next.sha || previous.branch !== next.branch) return 'history';
  if (previous.dirty !== next.dirty || previous.changes !== next.changes) return 'head';
  return 'none';
};
