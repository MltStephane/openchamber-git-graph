# Git Graph (OpenChamber extension)

Shows the git history graph of the project open in OpenChamber: colored lanes, merges, ref badges (HEAD, local and remote branches, tags), subject, author, relative date.

- **Panel** on the rail (`git-merge` icon) and **full-screen view** ("Extension pages" menu above the session list).
- Click (or Enter) on a commit: opens its diff (`host.openCommit`). "Copy" button: copies the full hash. A row's tooltip shows the full hash, the author, the absolute date and the subject.
- "All branches" / "Current branch" tabs, text filter on subject and author, pagination by 500 ("Load 500 more").
- Hot reload: reload on project change, then `/head` is polled every 3 s while the panel is visible; the log is read again only when the refs, HEAD or the current branch change, otherwise only the header line is updated. Paused on error until "Retry".
- Follows the light/dark theme via `applyHostReady`; one color per lane, taken from the theme tokens.

## Installation

1. In OpenChamber (web or desktop): **Settings → Extensions**.
2. Paste the absolute path of the folder: `/home/ubuntu/Projets/OpenchamberExtensions/openchamber-git-graph`, then **Add**.
3. Approve the request: the extension declares a **local service** that runs `git`. Without this approval, the panel shows "Local service not allowed".
4. Click the Git Graph icon on the rail.

The built files (`panel/main.js`, `service/main.js`) are shipped: OpenChamber compiles nothing. After changing the sources, run `npm run build` again, then reload the extension.

## How it works

The page runs in a sandboxed iframe, with no network and no access to git. It goes through `host.serviceRequest` to a local Node service that OpenChamber starts (`contributes.service`, see `GUEST_SERVICES.md` in `@openchamber/sdk`). The service listens on `127.0.0.1`, requires the `OPENCHAMBER_SERVICE_TOKEN` token, and runs git through `execFile` (no shell) with `GIT_OPTIONAL_LOCKS=0`: read-only, no injection possible through the parameters.

| Route | Parameters | Response |
|---|---|---|
| `GET /health` | | `{ ok: true }` |
| `GET /log` | `dir` (absolute), `limit` (1–2000, default 500), `skip` (default 0), `scope` (`all` \| `current`) | `{ commits: [{ hash, parents, refs, author, timestamp, subject }], hasMore }` |
| `GET /head` | `dir` | `{ branch, sha, dirty, changes, refs }` (`refs`: sha1 fingerprint of `git for-each-ref` and HEAD) |

Errors: `{ error, message }` with `400 bad-request` (non-absolute path), `422 no-directory` / `422 not-a-repo`, `500 no-git` / `git-failed`. A repository without commits returns an empty list.

`/log` runs `git log --topo-order --date-order --decorate=full --all` (or `HEAD`). Both ordering options are passed; git applies the last one (`--date-order`), which also guarantees that a child always comes before its parents, the only condition the lane algorithm needs.

### Lane algorithm (`src/graph.ts`)

Deterministic, in a single pass over the commits from newest to oldest:

- a commit takes the leftmost lane waiting for it, otherwise the leftmost free lane;
- its first parent keeps that lane;
- every other parent (merge, octopus) reuses the lane already waiting for it, otherwise opens the leftmost free lane;
- the other lanes waiting for this commit converge to it and close;
- a root commit closes its lane.

When a text filter is active, the lines are hidden (they would lie about ancestry) and only the lane's colored dot remains.

## Development

```sh
npm install
npm run build      # panel/main.js (browser IIFE) + service/main.js (Node ESM), via openchamber-guest-bundle (Bun)
npm test           # bun test: lanes (linear, branch+merge, octopus, multiple roots, continuity over 200 random DAGs) + log parsing + i18n + hot-reload decision + service client + error mapping + filter + dates + graph geometry
npm run typecheck
```

Test the service by hand:

```sh
OPENCHAMBER_SERVICE_PORT=47999 OPENCHAMBER_SERVICE_TOKEN=t node service/main.js &
curl -H 'Authorization: Bearer t' 'http://127.0.0.1:47999/log?dir=/path/to/repo&limit=5'
```

## Tree

```
package.json                  manifest (openchamber.contributes: panel, page, service)
panel/index.html              page loaded in the iframe
panel/main.js                 IIFE bundle (built)
service/main.js               local service (built)
src/graph.ts                  lane algorithm
src/log-format.ts             git log format and parsing (shared by service / tests)
src/service-contract.ts       page size, limit, answer shapes and error codes shared by service and panel
src/service.ts                local HTTP service
src/panel/main.ts             panel orchestration: state, loading, rendering, polling
src/panel/service-client.ts   /log and /head through host.serviceRequest, answers checked against the contract
src/panel/problems.ts         service and host errors mapped to what the panel shows
src/panel/filter.ts           text filter on subject and author
src/panel/dates.ts            relative and absolute dates
src/panel/graph-geometry.ts   row and lane sizes, lane colours, SVG paths, dot kind (no DOM)
src/panel/view.ts             SVG rendering, badges, styles
src/panel/watch.ts            hot reload: what to read again when /head changes
test/                         bun tests
```
