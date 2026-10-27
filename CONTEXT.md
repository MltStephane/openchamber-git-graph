# Git Graph — Project context

## What the project is

An **OpenChamber** extension that shows the git history graph of the open project: colored lanes, merges, ref badges (HEAD, local and remote branches, tags), subject, author, relative date. Clicking a commit opens its diff in OpenChamber.

- Surfaces: a **panel** on the rail (`git-merge` icon) and a **full-screen page** ("Extension pages" menu).
- Personal extension, installed from a local path in OpenChamber (Settings → Extensions). Not published, no third-party users.
- Repository: `git@github.com:MltStephane/openchamber-git-graph.git`, branch `master`.

## Who it is for

The developer who drives coding agents in OpenChamber and wants to see, without leaving the tool, what the agents and they themselves have committed, on which branch, and whether the working copy is dirty. See `PERSONAS.md`.

## Golden rule: READ-ONLY, ZERO FRICTION

**The extension shows the history, it never changes it.** The service only runs read-only git commands (`log`, `rev-parse`, `symbolic-ref`, `status`, `for-each-ref`), with `GIT_OPTIONAL_LOCKS=0` so it never blocks git commands run by the user or the agents.

The graph must stay up to date without any user action and be readable at a glance in a narrow panel.

## What the product DOES

- Deterministic lane graph (`src/graph.ts`), all branches or current branch.
- Text filter on subject and author, pagination by 500 commits.
- Header line: current branch (or detached HEAD), number of uncommitted changes.
- Copy of the full hash, opening a commit's diff (`host.openCommit`).
- English and French interface (`src/panel/i18n.ts`), follows the light/dark theme.

## What the product DOES NOT do

- No git writes (checkout, commit, rebase, push, fetch…).
- No network access: the panel is a sandboxed iframe, it only talks to the local service through `host.serviceRequest`.

## Architecture in brief

- `src/panel/` → IIFE bundle `panel/main.js` (iframe).
- `src/service.ts` → `service/main.js` (Node, `127.0.0.1`, `OPENCHAMBER_SERVICE_TOKEN` token).
- Host and service contract: `node_modules/@openchamber/sdk/API.md` and `GUEST_SERVICES.md`.
- Built files are committed: OpenChamber compiles nothing.

## Log

Agent session changelog: Obsidian note `Historique des projets/OpenChamber Git Graph.md` (vault "Vault").
