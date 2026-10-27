# Git Graph (extension OpenChamber)

Affiche le graphe de l'historique git du projet ouvert dans OpenChamber : lanes colorées, merges, badges de refs (HEAD, branches locales et distantes, tags), sujet, auteur, date relative.

- **Panel** sur le rail (icône `git-branch`) et **vue plein écran** (menu « Extension pages » au-dessus de la liste des sessions).
- Clic (ou Entrée) sur un commit : ouvre son diff (`host.openCommit`). Bouton « Copier » : copie le hash complet. L'infobulle d'une ligne montre le hash complet, l'auteur, la date absolue et le sujet.
- Onglets « Toutes les branches » / « Branche courante », filtre texte sur sujet et auteur, pagination par 500 (« Charger 500 de plus »).
- Rafraîchissement automatique au changement de projet et quand une session passe à `completed` ; bouton « Rafraîchir ».
- Thème clair/sombre suivi via `applyHostReady` ; une couleur par lane tirée des tokens du thème.

## Installation

1. Dans OpenChamber (web ou desktop) : **Settings → Extensions**.
2. Coller le chemin absolu du dossier : `/home/ubuntu/Projets/OpenchamberExtensions/openchamber-git-graph`, puis **Add**.
3. Approuver la demande : l'extension déclare un **service local** qui exécute `git`. Sans cette approbation, le panel affiche « Service local non autorisé ».
4. Cliquer sur l'icône Git Graph du rail.

Les fichiers buildés (`panel/main.js`, `service/main.js`) sont livrés : OpenChamber ne compile rien. Après une modification des sources, relancer `npm run build` puis recharger l'extension.

## Fonctionnement

La page tourne dans un iframe sandboxé, sans réseau ni accès à git. Elle passe par `host.serviceRequest` vers un service Node local que OpenChamber démarre (`contributes.service`, voir `GUEST_SERVICES.md` dans `@openchamber/sdk`). Le service écoute sur `127.0.0.1`, exige le jeton `OPENCHAMBER_SERVICE_TOKEN`, et lance git par `execFile` (sans shell) avec `GIT_OPTIONAL_LOCKS=0` : lecture seule, aucune injection possible par les paramètres.

| Route | Paramètres | Réponse |
|---|---|---|
| `GET /health` | | `{ ok: true }` |
| `GET /log` | `dir` (absolu), `limit` (1–2000, défaut 500), `skip` (défaut 0), `scope` (`all` \| `current`) | `{ commits: [{ hash, parents, refs, author, timestamp, subject }], hasMore }` |
| `GET /head` | `dir` | `{ branch, sha, dirty, changes }` |

Erreurs : `{ error, message }` avec `400 bad-request` (chemin non absolu), `422 no-directory` / `422 not-a-repo`, `500 no-git` / `git-failed`. Un dépôt sans commit renvoie une liste vide.

`/log` lance `git log --topo-order --date-order --decorate=full --all` (ou `HEAD`). Les deux options d'ordre sont passées ; git applique la dernière (`--date-order`), qui garantit aussi qu'un enfant précède toujours ses parents, seule condition dont l'algorithme de lanes a besoin.

### Algorithme de lanes (`src/graph.ts`)

Déterministe, en une passe sur les commits du plus récent au plus ancien :

- un commit prend la lane la plus à gauche qui l'attend, sinon la lane libre la plus à gauche ;
- son premier parent garde cette lane ;
- chaque autre parent (merge, octopus) réutilise la lane qui l'attend déjà, sinon ouvre la lane libre la plus à gauche ;
- les autres lanes qui attendaient ce commit convergent vers lui et se ferment ;
- un commit racine ferme sa lane.

Quand un filtre texte est actif, les lignes sont masquées (elles mentiraient sur l'ascendance) et seul le point coloré de la lane reste.

## Développement

```sh
npm install
npm run build      # panel/main.js (IIFE navigateur) + service/main.js (ESM Node), via openchamber-guest-bundle (Bun)
npm test           # bun test : lanes (linéaire, branche+merge, octopus, racines multiples, continuité sur 200 DAG aléatoires) + parsing du log
npm run typecheck
```

Tester le service à la main :

```sh
OPENCHAMBER_SERVICE_PORT=47999 OPENCHAMBER_SERVICE_TOKEN=t node service/main.js &
curl -H 'Authorization: Bearer t' 'http://127.0.0.1:47999/log?dir=/chemin/du/depot&limit=5'
```

## Arborescence

```
package.json          manifest (openchamber.contributes : panel, page, service)
panel/index.html      page chargée dans l'iframe
panel/main.js         bundle IIFE (buildé)
service/main.js       service local (buildé)
src/graph.ts          algorithme de lanes
src/log-format.ts     format git log et parsing (partagé service / tests)
src/service.ts        service HTTP local
src/panel/main.ts     logique du panel
src/panel/view.ts     rendu SVG, badges, styles
test/                 tests bun
```
