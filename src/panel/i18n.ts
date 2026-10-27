/** A message whose form depends on the `count` parameter. */
type Plural = { one: string; other: string };

/** Reference dictionary: every other language must have the same keys and forms. */
const en = {
  'common.labelled': '{label}: {value}',
  'common.retry': 'Retry',
  'tabs.all': 'All branches',
  'tabs.current': 'Current branch',
  'search.placeholder': 'Filter by subject or author',
  'notice.starting': 'Starting the local service…',
  'notice.reading': 'Reading the history…',
  'empty.noCommits.title': 'No commits',
  'empty.noCommits.body': 'This repository has no history yet.',
  'empty.noProject.title': 'No project open',
  'empty.noProject.body': 'Open a project in OpenChamber to see its git history.',
  'head.detached': 'detached HEAD @ {sha}',
  'head.noCommit': 'no commits',
  'head.changes': { one: '{count} change', other: '{count} changes' },
  'head.dirtyTitle': 'Uncommitted changes in the working tree',
  'ref.current': 'Current branch',
  'ref.head': 'Detached HEAD',
  'ref.local': 'Local branch',
  'ref.remote': 'Remote branch',
  'ref.tag': 'Tag',
  'copy.label': 'Copy',
  'copy.done': 'Copied',
  'copy.title': 'Copy {hash}',
  'copy.failed': 'Could not copy the hash.',
  'commit.notFound': 'This commit cannot be found in the open project.',
  'commit.unsupported': 'This version of OpenChamber cannot open the diff here.',
  'commit.openFailed': 'Could not open the commit.',
  'list.noMatch': 'No loaded commit matches the filter.',
  'footer.commits': { one: '{count} commit', other: '{count} commits' },
  'footer.loaded': { one: '{count} commit loaded', other: '{count} commits loaded' },
  'footer.filtered': { one: '{shown} / {count} commit loaded', other: '{shown} / {count} commits loaded' },
  'footer.hiddenLanes': { one: '{count} hidden column', other: '{count} hidden columns' },
  'footer.loadMore': 'Load {count} more',
  'loadMore.failed': 'Could not load more commits.',
  'error.service.title': 'The git service failed',
  'error.unauthorized': 'The local service rejected the request. Try again.',
  'error.notFound': 'The local service does not know this request. Update the extension.',
  'error.badRequest': 'The project folder is not a valid path.',
  'error.noGit': 'git is not installed on the OpenChamber host.',
  'error.gitFailed': 'git returned an error.',
  'error.badAnswer': 'The local service sent an unreadable answer.',
  'error.http': 'The local service returned an unexpected error.',
  'error.serviceUnknown': 'The local service reported an unknown error.',
  'error.notARepo.title': 'Not a git repository',
  'error.notARepo.message': 'This folder is not a git repository.',
  'error.noDirectory.message': 'This folder cannot be found.',
  'error.noService.title': 'Local service not allowed',
  'error.noService.body': 'This extension reads the history through a local service. Allow it in Settings → Extensions, then retry.',
  'error.serviceFailed.title': 'The local service crashed or did not start',
  'error.serviceFailed.message': 'Retry; if it keeps failing, restart the extension.',
  'error.disabled.title': 'Extension paused',
  'error.disabled.message': 'Turn it back on in Settings → Extensions.',
  'error.timeout.title': 'Timed out',
  'error.timeout.message': 'The git service did not answer in time. Retry.',
  'error.host.title': 'Error {code}',
  'error.host.message': 'OpenChamber could not handle the request.',
  'error.unexpected.title': 'Unexpected error',
  'error.unexpected.message': 'Something went wrong in the panel.',
};

const fr: typeof en = {
  'common.labelled': '{label} : {value}',
  'common.retry': 'Réessayer',
  'tabs.all': 'Toutes les branches',
  'tabs.current': 'Branche courante',
  'search.placeholder': 'Filtrer par sujet ou auteur',
  'notice.starting': 'Démarrage du service local…',
  'notice.reading': 'Lecture de l’historique…',
  'empty.noCommits.title': 'Aucun commit',
  'empty.noCommits.body': 'Ce dépôt n’a pas encore d’historique.',
  'empty.noProject.title': 'Aucun projet ouvert',
  'empty.noProject.body': 'Ouvrez un projet dans OpenChamber pour voir son historique git.',
  'head.detached': 'HEAD détaché @ {sha}',
  'head.noCommit': 'aucun commit',
  'head.changes': { one: '{count} modif', other: '{count} modifs' },
  'head.dirtyTitle': 'Modifications non commitées dans la copie de travail',
  'ref.current': 'Branche courante',
  'ref.head': 'HEAD détaché',
  'ref.local': 'Branche locale',
  'ref.remote': 'Branche distante',
  'ref.tag': 'Tag',
  'copy.label': 'Copier',
  'copy.done': 'Copié',
  'copy.title': 'Copier {hash}',
  'copy.failed': 'Impossible de copier le hash.',
  'commit.notFound': 'Ce commit est introuvable dans le projet ouvert.',
  'commit.unsupported': 'Cette version d’OpenChamber ne peut pas ouvrir le diff ici.',
  'commit.openFailed': 'Impossible d’ouvrir le commit.',
  'list.noMatch': 'Aucun commit chargé ne correspond au filtre.',
  'footer.commits': { one: '{count} commit', other: '{count} commits' },
  'footer.loaded': { one: '{count} commit chargé', other: '{count} commits chargés' },
  'footer.filtered': { one: '{shown} / {count} commit chargé', other: '{shown} / {count} commits chargés' },
  'footer.hiddenLanes': { one: '{count} colonne masquée', other: '{count} colonnes masquées' },
  'footer.loadMore': 'Charger {count} de plus',
  'loadMore.failed': 'Impossible de charger plus de commits.',
  'error.service.title': 'Le service git a échoué',
  'error.unauthorized': 'Le service local a refusé la requête. Réessayez.',
  'error.notFound': 'Le service local ne connaît pas cette requête. Mettez l’extension à jour.',
  'error.badRequest': 'Le dossier du projet n’est pas un chemin valide.',
  'error.noGit': 'git n’est pas installé sur l’hôte OpenChamber.',
  'error.gitFailed': 'git a renvoyé une erreur.',
  'error.badAnswer': 'Le service local a renvoyé une réponse illisible.',
  'error.http': 'Le service local a renvoyé une erreur inattendue.',
  'error.serviceUnknown': 'Le service local a signalé une erreur inconnue.',
  'error.notARepo.title': 'Pas un dépôt git',
  'error.notARepo.message': 'Ce dossier n’est pas un dépôt git.',
  'error.noDirectory.message': 'Ce dossier est introuvable.',
  'error.noService.title': 'Service local non autorisé',
  'error.noService.body': 'Cette extension lit l’historique via un service local. Autorisez-le dans Settings → Extensions, puis réessayez.',
  'error.serviceFailed.title': 'Le service local a planté ou n’a pas démarré',
  'error.serviceFailed.message': 'Réessayez ; si l’échec persiste, redémarrez l’extension.',
  'error.disabled.title': 'Extension en pause',
  'error.disabled.message': 'Réactivez-la dans Settings → Extensions.',
  'error.timeout.title': 'Délai dépassé',
  'error.timeout.message': 'Le service git n’a pas répondu à temps. Réessayez.',
  'error.host.title': 'Erreur {code}',
  'error.host.message': 'OpenChamber n’a pas pu traiter la requête.',
  'error.unexpected.title': 'Erreur inattendue',
  'error.unexpected.message': 'Le panneau a rencontré un problème.',
};

export const DICTIONARIES = { en, fr };
export type Locale = keyof typeof DICTIONARIES;
export type MessageKey = keyof typeof en;
export type MessageParams = Record<string, string | number>;

const isLocale = (tag: string): tag is Locale => Object.hasOwn(DICTIONARIES, tag);

/** Exact tag first, then its base language (`fr-CA` → `fr`), else English. */
export const resolveLocale = (tag: string | null | undefined): Locale => {
  const normalized = (tag ?? '').trim().toLowerCase();
  if (isLocale(normalized)) return normalized;
  const base = normalized.split('-')[0] ?? '';
  return isLocale(base) ? base : 'en';
};

let current: Locale = 'en';

export const setLocale = (tag: string | null | undefined): Locale => {
  current = resolveLocale(tag);
  return current;
};

const pluralRules = new Map<Locale, Intl.PluralRules>();
const pluralCategory = (count: number): Intl.LDMLPluralRule => {
  let rules = pluralRules.get(current);
  if (!rules) {
    rules = new Intl.PluralRules(current);
    pluralRules.set(current, rules);
  }
  return rules.select(count);
};

export const t = (key: MessageKey, params: MessageParams = {}): string => {
  const entry: string | Plural = DICTIONARIES[current][key];
  const { count } = params;
  const template = typeof entry === 'string' ? entry
    : typeof count === 'number' && pluralCategory(count) === 'one' ? entry.one : entry.other;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
};
