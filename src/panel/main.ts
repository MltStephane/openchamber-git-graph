import { connectHost, HostRequestError, type SessionLifecyclePhase } from '@openchamber/sdk';
import { applyHostReady, mountBanner, mountButton, mountEmpty, mountSearchField, mountSpinner, mountTabs } from '@openchamber/sdk/ui';

import { layoutGraph, type GraphLayout } from '../graph.ts';
import type { Commit } from '../log-format.ts';
import { drawDot, drawRowGraph, element, graphWidth, MAX_LANES, refBadge, STYLE } from './view.ts';

const PAGE = 500;
/** The service answers at most this many commits per call; a refresh reloads up to it. */
const RELOAD_MAX = 2000;

type Scope = 'all' | 'current';
type Head = { branch: string | null; sha: string | null; dirty: boolean; changes: number };
type LogPage = { commits: Commit[]; hasMore: boolean };
type Problem =
  | { kind: 'no-project' }
  | { kind: 'not-a-repo'; message: string }
  | { kind: 'no-service' }
  | { kind: 'service-failed'; message: string }
  | { kind: 'error'; title: string; message: string };

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
  try { body = JSON.parse(result.body); } catch { throw new ServiceError('bad-answer', `Réponse illisible du service (HTTP ${result.status}).`); }
  if (result.status !== 200) {
    const code = isObject(body) && typeof body.error === 'string' ? body.error : 'http';
    const message = isObject(body) && typeof body.message === 'string' ? body.message : `HTTP ${result.status}`;
    throw new ServiceError(code, message);
  }
  return body;
};

const readLog = async (dir: string, scope: Scope, limit: number, skip: number): Promise<LogPage> => {
  const body = await ask('/log', { dir, scope, limit: String(limit), skip: String(skip) });
  if (!isObject(body) || !Array.isArray(body.commits)) throw new ServiceError('bad-answer', 'Réponse inattendue du service.');
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

const toProblem = (error: unknown): Problem => {
  if (error instanceof ServiceError) {
    if (error.code === 'not-a-repo' || error.code === 'no-directory') return { kind: 'not-a-repo', message: error.message };
    return { kind: 'error', title: 'Le service git a échoué', message: error.message };
  }
  if (error instanceof HostRequestError) {
    if (error.code === 'NO_SERVICE') return { kind: 'no-service' };
    if (error.code === 'SERVICE_FAILED') return { kind: 'service-failed', message: error.message };
    if (error.code === 'DISABLED') return { kind: 'error', title: 'Extension en pause', message: 'Réactivez-la dans Settings → Extensions.' };
    if (error.code === 'HOST_TIMEOUT') return { kind: 'error', title: 'Délai dépassé', message: 'Le service git n’a pas répondu à temps. Réessayez.' };
    return { kind: 'error', title: `Erreur ${error.code}`, message: error.message };
  }
  return { kind: 'error', title: 'Erreur inattendue', message: error instanceof Error ? error.message : String(error) };
};

// ----- State -----

let directory: string | null = null;
let locale = 'fr';
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
  items: [{ id: 'all', label: 'Toutes les branches' }, { id: 'current', label: 'Branche courante' }],
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
  placeholder: 'Filtrer par sujet ou auteur',
  onChange: (next) => {
    query = next;
    search.update({ value: next });
    renderList();
    renderFooter();
  },
});

const refresh = mountButton(refreshRoot, {
  label: 'Rafraîchir', variant: 'ghost', size: 'xs', onClick: () => { void load({ keepCount: true }); },
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
    void host.toast({ kind: 'error', message: failure.kind === 'error' ? `${failure.title} : ${failure.message}` : 'Impossible de charger plus de commits.' });
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
    mountedNotice.push(mountSpinner(notice, { label: starting ? 'Démarrage du service local…' : 'Lecture de l’historique…' }));
    return;
  }
  if (!problem) {
    if (!loading && commits.length === 0 && directory) {
      mountedNotice.push(mountEmpty(notice, { title: 'Aucun commit', body: 'Ce dépôt n’a pas encore d’historique.' }));
    }
    return;
  }
  const retry = { label: 'Réessayer', onClick: () => { void load({ keepCount: false }); } };
  switch (problem.kind) {
    case 'no-project':
      mountedNotice.push(mountEmpty(notice, { title: 'Aucun projet ouvert', body: 'Ouvrez un projet dans OpenChamber pour voir son historique git.' }));
      break;
    case 'not-a-repo':
      mountedNotice.push(mountEmpty(notice, { title: 'Pas un dépôt git', body: `${directory ?? ''}\n${problem.message}`, action: retry }));
      break;
    case 'no-service':
      mountedNotice.push(mountBanner(notice, {
        tone: 'warning', title: 'Service local non autorisé',
        body: 'Cette extension lit l’historique via un service local. Autorisez-le dans Settings → Extensions, puis réessayez.',
        action: retry,
      }));
      break;
    case 'service-failed':
      mountedNotice.push(mountBanner(notice, { tone: 'error', title: 'Le service local a planté ou n’a pas démarré', body: problem.message, action: retry }));
      break;
    case 'error':
      mountedNotice.push(mountBanner(notice, { tone: 'error', title: problem.title, body: problem.message, action: retry }));
      break;
  }
};

const renderHead = () => {
  headInfo.replaceChildren();
  if (!head || problem) return;
  const label = head.branch ?? (head.sha ? `HEAD détaché @ ${head.sha.slice(0, 7)}` : 'aucun commit');
  const branch = element('span', 'branch', label);
  branch.title = head.sha ?? '';
  headInfo.append(element('span', '', '⎇'), branch);
  if (head.dirty) {
    const dirty = element('span', 'dirty', `● ${head.changes} modif${head.changes > 1 ? 's' : ''}`);
    dirty.title = 'Modifications non commitées dans la copie de travail';
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
      ? error.code === 'NOT_FOUND' ? 'Ce commit est introuvable dans le projet ouvert.'
        : error.code === 'UNSUPPORTED' ? 'Cette version d’OpenChamber ne peut pas ouvrir le diff ici.'
          : `${error.code} : ${error.message}`
      : 'Impossible d’ouvrir le commit.';
    void host.toast({ kind: 'error', message });
  });
};

const copyHash = (commit: Commit, button: HTMLButtonElement) => {
  void host.writeClipboard(commit.hash).then(() => {
    button.textContent = 'Copié';
    button.classList.add('done');
    setTimeout(() => { button.textContent = 'Copier'; button.classList.remove('done'); }, 1200);
  }).catch(() => { void host.toast({ kind: 'error', message: 'Impossible de copier le hash.' }); });
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
  const copy = element('button', 'copy', 'Copier');
  copy.type = 'button';
  copy.title = `Copier ${commit.hash}`;
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
  if (needle && rows.length === 0 && commits.length > 0) rows.push(element('div', 'footer', 'Aucun commit chargé ne correspond au filtre.'));
  list.replaceChildren(...rows);
};

const renderFooter = () => {
  footer.replaceChildren();
  if (commits.length === 0) return;
  const needle = query.trim().toLowerCase();
  const shown = needle ? commits.filter((commit) => matches(commit, needle)).length : commits.length;
  const count = needle ? `${shown} / ${commits.length} commits chargés` : `${commits.length} commits${hasMore ? ' chargés' : ''}`;
  footer.append(element('span', '', count));
  if (layout.width > MAX_LANES) footer.append(element('span', '', `· ${layout.width - MAX_LANES} colonnes masquées`));
  if (hasMore) {
    const more = element('div');
    footer.append(more);
    mountButton(more, { label: `Charger ${PAGE} de plus`, variant: 'secondary', size: 'xs', loading: loadingMore, onClick: () => { void loadMore(); } });
  }
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
  const nextLocale = context.locale || 'fr';
  if (mounted && nextLocale === locale) return;
  locale = nextLocale;
  mounted = true;
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

render();
