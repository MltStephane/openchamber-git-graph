// What `git log` prints and how it is read back. Shared by the service and the tests.

export const FIELD = '\x1f';
export const RECORD = '\x1e';
// hash, parents, decorations (full ref names), author, author date (unix seconds), subject
export const LOG_FORMAT = ['%H', '%P', '%D', '%an', '%at', '%s'].join('%x1f') + '%x1e';

export type RefKind = 'head' | 'local' | 'remote' | 'tag';
export type Ref = { name: string; kind: RefKind; current: boolean };
export type Commit = {
  hash: string;
  parents: string[];
  refs: Ref[];
  author: string;
  /** Author date, unix seconds. */
  timestamp: number;
  subject: string;
};

const refFromFullName = (full: string): Ref | null => {
  if (full.startsWith('refs/heads/')) return { name: full.slice('refs/heads/'.length), kind: 'local', current: false };
  if (full.startsWith('refs/remotes/')) {
    const name = full.slice('refs/remotes/'.length);
    // origin/HEAD only repeats the remote's default branch.
    return name.endsWith('/HEAD') ? null : { name, kind: 'remote', current: false };
  }
  if (full.startsWith('refs/tags/')) return { name: full.slice('refs/tags/'.length), kind: 'tag', current: false };
  return null;
};

/**
 * `%D` with `--decorate=full`: "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1".
 * A detached HEAD shows as a bare "HEAD". The checked-out branch comes first.
 */
export const parseDecorations = (value: string): Ref[] => {
  const refs: Ref[] = [];
  for (const raw of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    if (raw === 'HEAD') {
      refs.unshift({ name: 'HEAD', kind: 'head', current: true });
      continue;
    }
    const current = raw.startsWith('HEAD -> ');
    const full = current ? raw.slice('HEAD -> '.length) : raw.startsWith('tag: ') ? raw.slice('tag: '.length) : raw;
    const ref = refFromFullName(full);
    if (!ref) continue;
    if (current) refs.unshift({ ...ref, current });
    else refs.push(ref);
  }
  return refs;
};

export const parseLog = (stdout: string): Commit[] => stdout
  .split(RECORD)
  .map((record) => record.replace(/^\n/, ''))
  .filter(Boolean)
  .map((record) => {
    const [hash = '', parents = '', decorations = '', author = '', timestamp = '0', ...subject] = record.split(FIELD);
    return {
      hash,
      parents: parents.split(' ').filter(Boolean),
      refs: parseDecorations(decorations),
      author,
      timestamp: Number.parseInt(timestamp, 10) || 0,
      // A subject that itself contains the separator stays whole.
      subject: subject.join(FIELD),
    };
  });
