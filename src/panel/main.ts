import { connectHost, HostRequestError, type SessionLifecyclePhase } from '@openchamber/sdk';
import { applyHostReady, mountBanner, mountButton, mountEmpty, mountSearchField, mountSpinner, mountTabs } from '@openchamber/sdk/ui';

import { layoutGraph, type GraphLayout } from '../graph.ts';
import type { Commit } from '../log-format.ts';
import { resolveLocale, setLocale, t, type MessageKey, type MessageParams } from './i18n.ts';
import { drawDot, drawRowGraph, element, graphWidth, MAX_LANES, refBadge, STYLE } from './view.ts';

const PAGE = 500;
/** The service answers at most this many commits per call; a refresh reloads up to it. */
const RELOAD_MAX = 2000;

type Scope = 'all' | 'current';
type Head = { branch: string | null; sha: string | null; dirty: boolean; changes: number };
type LogPage = { commits: Commit[]; hasMore: boolean };
/** Texts are kept as keys so a locale change repaints them; `detail` is the raw, untranslated cause. */
type Problem =
  | { kind: 'no-project' }
  | { kind: 'not-a-repo'; message: MessageKey }
  | { kind: 'no-service' }
  | { kind: 'error'; title: MessageKey; message: MessageKey; params?: MessageParams; detail?: string };

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');
const style = document.createElement('style');
style.textContent = STYLE;
document.head.append(style);

// ----- Service calls -----

/** A failure the service itself reported, with its own code. */
class ServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const ask = async (path: string, query: Record<string, string>): Promise<unknown> => {
  const result = await host.serviceRequest({ method: 'GET', path, query });
  let body: unknown;
  try { body = JSON.parse(result.body); } catch { throw new ServiceError('bad-answer', `Unparsable body (HTTP ${result.status})`); }
  if (result.status !== 200) {
    const code = isObject(body) && typeof body.error === 'string' ? body.error : 'http';
    const message = isObject(body) && typeof body.message === 'string' ? body.message : `HTTP ${result.status}`;
    throw new ServiceError(code, message);
  }
  return body;
};

const readLog = async (dir: string, scope: Scope, limit: number, skip: number): Promise<LogPage> => {
  const body = await ask('/log', { dir, scope, limit: String(limit), skip: String(skip) });
  if (!isObject(body) || !Array.isArray(body.commits)) throw new ServiceError('bad-answer', 'Unexpected /log payload');
  return { commits: body.commits as Commit[], hasMore: body.hasMore === true };
};

const readHead = async (dir: string): Promise<Head | null> => {
  try {
    const body = await ask('/head', { dir });
    return isObject(body) ? body as Head : null;
  } catch {
    return null; // The header line is a bonus; the log reports the real problem.
  }
};

/** Service codes whose raw message adds nothing to the translated one. */
const SERVICE_MESSAGE = new Map<string, MessageKey>([
  ['unauthorized', 'error.unauthorized'],
  ['not-found', 'error.notFound'],
  ['bad-request', 'error.badRequest'],
  ['no-git', 'error.noGit'],
]);
/** Service codes whose raw message is the only real explanation, kept as detail. */
const SERVICE_MESSAGE_WITH_DETAIL = new Map<string, MessageKey>([
  ['git-failed', 'error.gitFailed'],
  ['bad-answer', 'error.badAnswer'],
  ['http', 'error.http'],
]);

const toProblem = (error: unknown): Problem => {
  if (error instanceof ServiceError) {
    if (error.code === 'not-a-repo') return { kind: 'not-a-repo', message: 'error.notARepo.message' };
    if (error.code === 'no-directory') return { kind: 'not-a-repo', message: 'error.noDirectory.message' };
    const message = SERVICE_MESSAGE.get(error.code);
    if (message) return { kind: 'error', title: 'error.service.title', message };
    return { kind: 'error', title: 'error.service.title', message: SERVICE_MESSAGE_WITH_DETAIL.get(error.code) ?? 'error.serviceUnknown', detail: error.message };
  }
  if (error instanceof HostRequestError) {
    if (error.code === 'NO_SERVICE') return { kind: 'no-service' };
    if (error.code === 'SERVICE_FAILED') return { kind: 'error', title: 'error.serviceFailed.title', message: 'error.serviceFailed.message', detail: error.message };
    if (error.code === 'DISABLED') return { kind: 'error', title: 'error.disabled.title', message: 'error.disabled.message' };
    if (error.code === 'HOST_TIMEOUT') return { kind: 'error', title: 'error.timeout.title', message: 'error.timeout.message' };
    return { kind: 'error', title: 'error.host.title', message: 'error.host.message', params: { code: error.code }, detail: error.message };
  }
  return { kind: 'error', title: 'error.unexpected.title', message: 'error.unexpected.message', detail: error instanceof Error ? error.message : String(error) };
};

// ----- State -----

let directory: string | null = null;
let locale = resolveLocale(undefined);
let scope: Scope = 'all';
let query = '';
let commits: Commit[] = [];
let hasMore = false;
let head: Head | null = null;
let layout: GraphLayout = { rows: [], width: 0 };
let problem: Problem | null = null;
let loading = false;
let loadingMore = false;
let starting = false;
let generation = 0;

// ----- Layout of the page -----

const toolbar = element('div', 'toolbar');
const notice = element('div', 'notice');
const list = element('div', 'list');
const footer = element('div', 'footer');
root.append(toolbar, notice, list, footer);

const tabsRoot = toolbar.appendChild(element('div'));
const searchRoot = toolbar.appendChild(element('div', 'search'));
const headInfo = toolbar.appendChild(element('div', 'headinfo'));
toolbar.append(element('span', 'grow'));
const refreshRoot = toolbar.appendChild(element('div'));

const tabs = mountTabs(tabsRoot, {
  items: [],
  activeId: scope,
  onChange: (next) => {
    if (next !== 'all' && next !== 'current') return;
    scope = next;
    tabs.update({ activeId: scope });
    void load({ keepCount: false });
  },
});

const search = mountSearchField(searchRoot, {
  value: query,
  onChange: (next) => {
    query = next;
    search.update({ value: next });
    renderList();
    renderFooter();
  },
});

const refresh = mountButton(refreshRoot, {
  label: '', variant: 'ghost', size: 'xs', onClick: () => { void load({ keepCount: true }); },
});

// ----- Loading -----

/** Reload the first page; `keepCount` keeps as many commits as are already shown (up to RELOAD_MAX). */
const load = async ({ keepCount }: { keepCount: boolean }) => {
  const current = ++generation;
  if (!directory) {
    commits = []; hasMore = false; head = null; problem = { kind: 'no-project' }; loading = false;
    render();
    return;
  }
  const dir = directory;
  const limit = keepCount ? Math.min(Math.max(PAGE, commits.length), RELOAD_MAX) : PAGE;
  loading = true;
  problem = null;
  render();
  try {
    // serviceRequest starts a stopped service itself; this only tells the user why the first load waits.
    starting = (await host.serviceStatus().catch(() => null))?.status !== 'ready';
    if (current !== generation) return;
    if (starting) render();
    const [page, nextHead] = await Promise.all([readLog(dir, scope, limit, 0), readHead(dir)]);
    if (current !== generation) return;
    commits = page.commits;
    hasMore = page.hasMore;
    head = nextHead;
  } catch (error) {
    if (current !== generation) return;
    commits = []; hasMore = false; head = null;
    problem = toProblem(error);
  }
  loading = false;
  starting = false;
  layout = layoutGraph(commits);
  render();
};

const loadMore = async () => {
  if (!directory || loadingMore || !hasMore) return;
  const current = generation;
  const dir = directory;
  loadingMore = true;
  renderFooter();
  try {
    const page = await readLog(dir, scope, PAGE, commits.length);
    if (current !== generation) return;
    // Drop anything already shown, in case history moved between the two calls.
    const known = new Set(commits.map((commit) => commit.hash));
    commits = [...commits, ...page.commits.filter((commit) => !known.has(commit.hash))];
    hasMore = page.hasMore;
    layout = layoutGraph(commits);
  } catch (error) {
    if (current !== generation) return;
    const failure = toProblem(error);
    const message = failure.kind === 'error'
      ? t('common.labelled', { label: t(failure.title, failure.params), value: t(failure.message) })
      : t('loadMore.failed');
    void host.toast({ kind: 'error', message });
  } finally {
    if (current === generation) loadingMore = false;
  }
  render();
};

// ----- Rendering -----

let mountedNotice: Array<{ dispose: () => void }> = [];
const clearNotice = () => {
  for (const block of mountedNotice) block.dispose();
  mountedNotice = [];
  notice.replaceChildren();
};

const renderNotice = () => {
  clearNotice();
  if (loading && commits.length === 0) {
    mountedNotice.push(mountSpinner(notice, { label: t(starting ? 'notice.starting' : 'notice.reading') }));
    return;
  }
  if (!problem) {
    if (!loading && commits.length === 0 && directory) {
      mountedNotice.push(mountEmpty(notice, { title: t('empty.noCommits.title'), body: t('empty.noCommits.body') }));
    }
    return;
  }
  const retry = { label: t('common.retry'), onClick: () => { void load({ keepCount: false }); } };
  switch (problem.kind) {
    case 'no-project':
      mountedNotice.push(mountEmpty(notice, { title: t('empty.noProject.title'), body: t('empty.noProject.body') }));
      break;
    case 'not-a-repo':
      mountedNotice.push(mountEmpty(notice, { title: t('error.notARepo.title'), body: `${directory ?? ''}\n${t(problem.message)}`, action: retry }));
      break;
    case 'no-service':
      mountedNotice.push(mountBanner(notice, {
        tone: 'warning', title: t('error.noService.title'), body: t('error.noService.body'),
        action: retry,
      }));
      break;
    case 'error': {
      const message = t(problem.message);
      const body = problem.detail ? `${message}\n${problem.detail}` : message;
      mountedNotice.push(mountBanner(notice, { tone: 'error', title: t(problem.title, problem.params), body, action: retry }));
      break;
    }
  }
};

const renderHead = () => {
  headInfo.replaceChildren();
  if (!head || problem) return;
  const label = head.branch ?? (head.sha ? t('head.detached', { sha: head.sha.slice(0, 7) }) : t('head.noCommit'));
  const branch = element('span', 'branch', label);
  branch.title = head.sha ?? '';
  headInfo.append(element('span', '', '⎇'), branch);
  if (head.dirty) {
    const dirty = element('span', 'dirty', `● ${t('head.changes', { count: head.changes })}`);
    dirty.title = t('head.dirtyTitle');
    headInfo.append(dirty);
  }
};

const relativeDate = (timestamp: number): string => {
  const seconds = timestamp - Date.now() / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds), 'second');
};

const absoluteDate = (timestamp: number): string => new Date(timestamp * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

const openCommit = (commit: Commit) => {
  void host.openCommit(commit.hash).catch((error: unknown) => {
    const message = error instanceof HostRequestError
      ? error.code === 'NOT_FOUND' ? t('commit.notFound')
        : error.code === 'UNSUPPORTED' ? t('commit.unsupported')
          : t('common.labelled', { label: error.code, value: error.message })
      : t('commit.openFailed');
    void host.toast({ kind: 'error', message });
  });
};

const copyHash = (commit: Commit, button: HTMLButtonElement) => {
  void host.writeClipboard(commit.hash).then(() => {
    button.textContent = t('copy.done');
    button.classList.add('done');
    setTimeout(() => { button.textContent = t('copy.label'); button.classList.remove('done'); }, 1200);
  }).catch(() => { void host.toast({ kind: 'error', message: t('copy.failed') }); });
};

const matches = (commit: Commit, needle: string): boolean =>
  commit.subject.toLowerCase().includes(needle) || commit.author.toLowerCase().includes(needle);

const renderRow = (commit: Commit, index: number, filtered: boolean, width: number): HTMLElement => {
  const graph = layout.rows[index];
  const isCurrent = commit.refs.some((ref) => ref.current);
  const row = element('div', isCurrent ? 'row current' : 'row');
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.title = `${commit.hash}\n${commit.author} — ${absoluteDate(commit.timestamp)}\n${commit.subject}`;
  if (graph) row.append(filtered ? drawDot(graph.lane) : drawRowGraph(graph, width, isCurrent ? 'current' : commit.parents.length > 1 ? 'merge' : 'commit'));
  if (commit.refs.length > 0) {
    const refs = element('span', 'refs');
    for (const ref of commit.refs) refs.append(refBadge(ref));
    row.append(refs);
  }
  const copy = element('button', 'copy', t('copy.label'));
  copy.type = 'button';
  copy.title = t('copy.title', { hash: commit.hash });
  copy.addEventListener('click', (event) => { event.stopPropagation(); copyHash(commit, copy); });
  copy.addEventListener('keydown', (event) => event.stopPropagation());
  row.append(
    element('span', 'subject', commit.subject),
    element('span', 'author', commit.author),
    element('span', 'date', relativeDate(commit.timestamp)),
    element('span', 'hash', commit.hash.slice(0, 7)),
    copy,
  );
  row.addEventListener('click', () => openCommit(commit));
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCommit(commit); }
  });
  return row;
};

const renderList = () => {
  const needle = query.trim().toLowerCase();
  const width = graphWidth(layout.width);
  const rows: HTMLElement[] = [];
  commits.forEach((commit, index) => {
    if (needle && !matches(commit, needle)) return;
    rows.push(renderRow(commit, index, needle !== '', width));
  });
  if (needle && rows.length === 0 && commits.length > 0) rows.push(element('div', 'footer', t('list.noMatch')));
  list.replaceChildren(...rows);
};

const renderFooter = () => {
  footer.replaceChildren();
  if (commits.length === 0) return;
  const needle = query.trim().toLowerCase();
  const shown = needle ? commits.filter((commit) => matches(commit, needle)).length : commits.length;
  const count = needle ? t('footer.filtered', { shown, count: commits.length })
    : t(hasMore ? 'footer.loaded' : 'footer.commits', { count: commits.length });
  footer.append(element('span', '', count));
  if (layout.width > MAX_LANES) footer.append(element('span', '', `· ${t('footer.hiddenLanes', { count: layout.width - MAX_LANES })}`));
  if (hasMore) {
    const more = element('div');
    footer.append(more);
    mountButton(more, { label: t('footer.loadMore', { count: PAGE }), variant: 'secondary', size: 'xs', loading: loadingMore, onClick: () => { void loadMore(); } });
  }
};

/** Toolbar controls are mounted once; only a locale change rewrites their texts. */
const renderLabels = () => {
  tabs.update({ items: [{ id: 'all', label: t('tabs.all') }, { id: 'current', label: t('tabs.current') }] });
  search.update({ placeholder: t('search.placeholder') });
  refresh.update({ label: t('toolbar.refresh') });
};

const render = () => {
  refresh.update({ disabled: !directory, loading: loading && commits.length > 0 });
  renderNotice();
  renderHead();
  renderList();
  renderFooter();
};

// ----- Host wiring -----

let mounted = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  document.body.dataset.surface = context.surface;
  const nextLocale = setLocale(context.locale);
  if (mounted && nextLocale === locale) return;
  locale = nextLocale;
  mounted = true;
  renderLabels();
  render();
});

let directorySeen = false;
host.onDirectory((next) => {
  if (directorySeen && next === directory) return;
  directorySeen = true;
  directory = next;
  commits = []; hasMore = false; head = null; layout = { rows: [], width: 0 };
  void load({ keepCount: false });
});

// An agent turn that just finished may have committed: read the history again.
// The first event of a session only replays its current phase, so it never counts as a transition.
const lastPhases = new Map<string, SessionLifecyclePhase>();
host.onSessionLifecycle((event) => {
  const previous = lastPhases.get(event.sessionId);
  lastPhases.set(event.sessionId, event.phase);
  if (previous !== undefined && previous !== 'completed' && event.phase === 'completed') void load({ keepCount: true });
});

renderLabels();
render();
