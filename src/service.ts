// Local service started by OpenChamber next to the extension (see GUEST_SERVICES.md in @openchamber/sdk).
// Runs under the app's Node runtime, listens on 127.0.0.1 and is reached only through the host proxy.
// Read-only: git runs through execFile (no shell) with optional locks off, so it never blocks the
// user's own git commands.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { LOG_FORMAT, parseLog, type Commit } from './log-format.ts';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
if (!port || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

const LIMIT_DEFAULT = 500;
const LIMIT_MAX = 2000;
const SKIP_MAX = 1_000_000;

type Failure = 'unauthorized' | 'not-found' | 'bad-request' | 'no-directory' | 'no-git' | 'not-a-repo' | 'git-failed';
type Answer =
  | { commits: Commit[]; hasMore: boolean }
  | { branch: string | null; sha: string | null; dirty: boolean; changes: number; refs: string }
  | { error: Failure; message: string }
  | { ok: true };
type GitResult = { ok: true; stdout: string } | { ok: false; failure: Failure; message: string; unknownRevision: boolean };
type Reply = { status: number; body: Answer };

const STATUS: Record<Failure, number> = {
  'unauthorized': 401, 'not-found': 404, 'bad-request': 400, 'no-directory': 422, 'not-a-repo': 422, 'no-git': 500, 'git-failed': 500,
};
const fail = (failure: Failure, message: string): Reply => ({ status: STATUS[failure], body: { error: failure, message } });

const json = (res: http.ServerResponse, { status, body }: Reply): void => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const git = (directory: string, args: string[]): Promise<GitResult> => new Promise((resolve) => {
  execFile('git', ['-C', directory, '-c', 'core.quotepath=off', '-c', 'log.showSignature=false', ...args], {
    timeout: 20_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  }, (error, stdout, stderr) => {
    if (!error) { resolve({ ok: true, stdout }); return; }
    const message = String(stderr || error.message).trim().split('\n')[0] ?? '';
    if ('code' in error && error.code === 'ENOENT') {
      resolve({ ok: false, failure: 'no-git', message: 'git is not installed on the OpenChamber host.', unknownRevision: false });
      return;
    }
    if (/not a git repository/i.test(stderr)) {
      resolve({ ok: false, failure: 'not-a-repo', message: 'This folder is not a git repository.', unknownRevision: false });
      return;
    }
    const unknownRevision = /unknown revision|bad revision|ambiguous argument|does not have any commits/i.test(stderr);
    resolve({ ok: false, failure: 'git-failed', message: message || 'git failed.', unknownRevision });
  });
});

/** `dir` must be an absolute path to an existing folder inside a git work tree (or a bare repository). */
const checkRepository = async (dir: string | null): Promise<Reply | null> => {
  if (!dir || !path.isAbsolute(dir) || dir.includes('\0')) return fail('bad-request', '`dir` must be an absolute path.');
  try {
    if (!(await stat(dir)).isDirectory()) return fail('no-directory', `${dir} is not a folder.`);
  } catch {
    return fail('no-directory', `${dir} does not exist.`);
  }
  const probe = await git(dir, ['rev-parse', '--git-dir']);
  return probe.ok ? null : fail(probe.failure, probe.message);
};

const parseInteger = (value: string | null, fallback: number, max: number, min = 0): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= min ? Math.min(parsed, max) : fallback;
};

const readLog = async (dir: string, params: URLSearchParams): Promise<Reply> => {
  const limit = parseInteger(params.get('limit'), LIMIT_DEFAULT, LIMIT_MAX, 1);
  const skip = parseInteger(params.get('skip'), 0, SKIP_MAX);
  const scope = params.get('scope') === 'current' ? 'current' : 'all';
  // --date-order comes after --topo-order and wins: commits stay in date order while
  // every child still comes before its parents, which is all the lane layout needs.
  const args = ['log', '--topo-order', '--date-order', '--decorate=full', `--format=${LOG_FORMAT}`,
    `--max-count=${limit + 1}`, `--skip=${skip}`];
  args.push(...(scope === 'all' ? ['--all'] : ['HEAD']), '--');
  const log = await git(dir, args);
  if (!log.ok) {
    // A repository without commits has no HEAD yet: that is an empty history, not an error.
    if (log.unknownRevision) return { status: 200, body: { commits: [], hasMore: false } };
    return fail(log.failure, log.message);
  }
  const commits = parseLog(log.stdout);
  const hasMore = commits.length > limit;
  return { status: 200, body: { commits: commits.slice(0, limit), hasMore } };
};

const readHead = async (dir: string): Promise<Reply> => {
  const [branch, sha, status, refs] = await Promise.all([
    git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(dir, ['rev-parse', '--verify', '-q', 'HEAD']),
    git(dir, ['status', '--porcelain=v1', '--untracked-files=normal']),
    git(dir, ['for-each-ref', '--format=%(objectname) %(refname)']),
  ]);
  const changes = status.ok ? status.stdout.split('\n').filter(Boolean).length : 0;
  const headSha = sha.ok ? sha.stdout.trim() || null : null;
  // Fingerprint of the visible history: the panel reloads the log only when it changes.
  const fingerprint = createHash('sha1').update(refs.ok ? refs.stdout : '').update(headSha ?? '').digest('hex');
  return {
    status: 200,
    body: {
      branch: branch.ok ? branch.stdout.trim() || null : null,
      sha: headSha,
      dirty: changes > 0,
      changes,
      refs: fingerprint,
    },
  };
};

const ROUTES: Record<string, (dir: string, params: URLSearchParams) => Promise<Reply>> = {
  '/log': readLog,
  '/head': readHead,
};

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, fail('unauthorized', 'Missing or wrong service token.'));
    return;
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') {
    json(res, { status: 200, body: { ok: true } });
    return;
  }
  const route = ROUTES[url.pathname];
  if (req.method !== 'GET' || !route) {
    json(res, fail('not-found', `No route ${req.method} ${url.pathname}.`));
    return;
  }
  const dir = url.searchParams.get('dir');
  void checkRepository(dir)
    .then((problem) => problem ?? route(dir as string, url.searchParams))
    .catch((error: unknown) => fail('git-failed', error instanceof Error ? error.message : String(error)))
    .then((reply) => json(res, reply));
});

server.listen(port, '127.0.0.1');
