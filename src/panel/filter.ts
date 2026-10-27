import type { Commit } from '../log-format.ts';

/** A commit the filter keeps, with its index in the full list: that is where its graph row is. */
export type FilteredCommit = { commit: Commit; index: number };

export type FilterResult = {
  /** True once the query says anything: the list then shows dots only and the footer a count. */
  active: boolean;
  matches: FilteredCommit[];
};

const matchesNeedle = (commit: Commit, needle: string): boolean =>
  commit.subject.toLowerCase().includes(needle) || commit.author.toLowerCase().includes(needle);

/** Case-insensitive match on subject and author; a blank query keeps every commit. */
export const filterCommits = (commits: readonly Commit[], query: string): FilterResult => {
  const needle = query.trim().toLowerCase();
  const matches = commits.flatMap((commit, index) => (needle === '' || matchesNeedle(commit, needle) ? [{ commit, index }] : []));
  return { active: needle !== '', matches };
};
