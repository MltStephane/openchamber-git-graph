import { connectHost, HostRequestError } from '@openchamber/sdk';
import { applyHostReady, mountBanner, mountButton, mountEmpty, mountSearchField, mountSpinner, mountTabs } from '@openchamber/sdk/ui';

import { layoutGraph, type GraphLayout, type GraphRow } from '../graph.ts';
import type { Commit } from '../log-format.ts';
import { LIMIT_MAX, PAGE_SIZE, type Head, type Scope } from '../service-contract.ts';
import { absoluteDate, relativeDate } from './dates.ts';
import { filterCommits, type FilterResult } from './filter.ts';
import { dotKind, graphWidth, MAX_LANES } from './graph-geometry.ts';
import { resolveLocale, setLocale, t } from './i18n.ts';
import { toProblem, type Problem } from './problems.ts';
import { createServiceClient } from './service-client.ts';
import { headChange } from './watch.ts';
import { drawDot, drawRowGraph, element, refBadge, STYLE } from './view.ts';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');
const style = document.createElement('style');
style.textContent = STYLE;
document.head.append(style);

// ----- Service calls -----

const service = createServiceClient(host);

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

/** Forget what was read: another project, a reload or a failed read all start from nothing. */
const resetHistory = () => {
  commits = []; hasMore = false; head = null; layout = { rows: [], width: 0 };
};

// ----- Layout of the page -----

const toolbar = element('div', 'toolbar');
const notice = element('div', 'notice');
const list = element('div', 'list');
const footer = element('div', 'footer');
root.append(toolbar, notice, list, footer);

const tabsRoot = toolbar.appendChild(element('div'));
const searchRoot = toolbar.appendChild(element('div', 'search'));
const headInfo = toolbar.appendChild(element('div', 'headinfo'));

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
    renderHistory();
  },
});

// ----- Loading -----

/** Reload the first page; `keepCount` keeps as many commits as are already shown (up to LIMIT_MAX). */
const load = async ({ keepCount }: { keepCount: boolean }) => {
  const current = ++generation;
  if (!directory) {
    resetHistory(); problem = { kind: 'no-project' }; loading = false;
    render();
    return;
  }
  const dir = directory;
  const limit = keepCount ? Math.min(Math.max(PAGE_SIZE, commits.length), LIMIT_MAX) : PAGE_SIZE;
  loading = true;
  problem = null;
  render();
  try {
    // serviceRequest starts a stopped service itself; this only tells the user why the first load waits.
    starting = (await host.serviceStatus().catch(() => null))?.status !== 'ready';
    if (current !== generation) return;
    if (starting) render();
    // The header line is a bonus; the log reports the real problem.
    const [page, nextHead] = await Promise.all([service.readLog(dir, scope, limit, 0), service.readHead(dir).catch(() => null)]);
    if (current !== generation) return;
    commits = page.commits;
    hasMore = page.hasMore;
    head = nextHead;
  } catch (error) {
    if (current !== generation) return;
    resetHistory();
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
  renderFooter(filterCommits(commits, query));
  try {
    const page = await service.readLog(dir, scope, PAGE_SIZE, commits.length);
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

const renderRow = (commit: Commit, graph: GraphRow | undefined, filtered: boolean, width: number): HTMLElement => {
  const dot = dotKind(commit);
  const row = element('div', dot === 'current' ? 'row current' : 'row');
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.title = `${commit.hash}\n${commit.author} — ${absoluteDate(commit.timestamp, locale)}\n${commit.subject}`;
  if (graph) row.append(filtered ? drawDot(graph.lane) : drawRowGraph(graph, width, dot));
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
    element('span', 'date', relativeDate(commit.timestamp, locale)),
    element('span', 'hash', commit.hash.slice(0, 7)),
    copy,
  );
  row.addEventListener('click', () => openCommit(commit));
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCommit(commit); }
  });
  return row;
};

const renderList = ({ active, matches }: FilterResult) => {
  const width = graphWidth(layout.width);
  const rows: HTMLElement[] = matches.map(({ commit, index }) => renderRow(commit, layout.rows[index], active, width));
  if (active && rows.length === 0 && commits.length > 0) rows.push(element('div', 'footer', t('list.noMatch')));
  list.replaceChildren(...rows);
};

const renderFooter = ({ active, matches }: FilterResult) => {
  footer.replaceChildren();
  if (commits.length === 0) return;
  const count = active ? t('footer.filtered', { shown: matches.length, count: commits.length })
    : t(hasMore ? 'footer.loaded' : 'footer.commits', { count: commits.length });
  footer.append(element('span', '', count));
  if (layout.width > MAX_LANES) footer.append(element('span', '', `· ${t('footer.hiddenLanes', { count: layout.width - MAX_LANES })}`));
  if (hasMore) {
    const more = element('div');
    footer.append(more);
    mountButton(more, { label: t('footer.loadMore', { count: PAGE_SIZE }), variant: 'secondary', size: 'xs', loading: loadingMore, onClick: () => { void loadMore(); } });
  }
};

/** The list and its footer show the same filtered set, computed once. */
const renderHistory = () => {
  const filtered = filterCommits(commits, query);
  renderList(filtered);
  renderFooter(filtered);
};

/** Toolbar controls are mounted once; only a locale change rewrites their texts. */
const renderLabels = () => {
  tabs.update({ items: [{ id: 'all', label: t('tabs.all') }, { id: 'current', label: t('tabs.current') }] });
  search.update({ placeholder: t('search.placeholder') });
};

const render = () => {
  renderNotice();
  renderHead();
  renderHistory();
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
  resetHistory();
  void load({ keepCount: false });
});

// ----- Watching -----

/** The service cannot push: while visible, the panel asks for the head and reloads only what moved. */
const WATCH_INTERVAL = 3000;
/** Pending tick; undefined while a tick runs, so a tick never overlaps another. */
let watchTimer: ReturnType<typeof setTimeout> | undefined;

const scheduleWatch = () => {
  watchTimer = setTimeout(() => { void watch(); }, WATCH_INTERVAL);
};

const watch = async () => {
  watchTimer = undefined;
  // A shown problem stops the polling: only "Retry" asks the service again (GUEST_SERVICES.md).
  if (document.visibilityState !== 'hidden' && directory && !problem && !loading && !loadingMore) {
    const current = generation;
    try {
      const next = await service.readHead(directory);
      if (current === generation) {
        const change = headChange(head, next);
        if (change === 'history') void load({ keepCount: true });
        if (change === 'head') { head = next; renderHead(); }
      }
    } catch (error) {
      // Shown as is rather than reloaded, so a failing /head cannot loop: the problem pauses the polling.
      if (current === generation) { problem = toProblem(error); render(); }
    }
  }
  scheduleWatch();
};

// Back from the background: read the state now instead of waiting for the next tick.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' || watchTimer === undefined) return;
  clearTimeout(watchTimer);
  void watch();
});

renderLabels();
render();
scheduleWatch();
