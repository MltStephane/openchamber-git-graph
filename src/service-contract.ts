// What the local service answers and what the panel expects. Shared so neither side redefines it.
import type { Commit } from './log-format.ts';

/** Commits per page: the first read and each "Load more". The service's default `limit`. */
export const PAGE_SIZE = 500;
/** The service answers at most this many commits per call; a reload reads up to it. */
export const LIMIT_MAX = 2000;

export type Scope = 'all' | 'current';

/** Answer of `/log`: one page of commits, newest first. */
export type LogPage = { commits: Commit[]; hasMore: boolean };

/** State of the repository as `/head` reports it; `refs` fingerprints every ref and HEAD. */
export type Head = { branch: string | null; sha: string | null; dirty: boolean; changes: number; refs: string };

export type FailureCode = 'unauthorized' | 'not-found' | 'bad-request' | 'no-directory' | 'no-git' | 'not-a-repo' | 'git-failed';

/** Body of every answer that is not a 200. */
export type Failure = { error: FailureCode; message: string };
