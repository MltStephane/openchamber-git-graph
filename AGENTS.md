# AGENTS.md — Git Graph

Working rules for this repository. Read together with `CONTEXT.md` (product) and `PERSONAS.md` (users).

## Stack

- Strict TypeScript (`noUncheckedIndexedAccess`), ESM, no runtime dependency besides `@openchamber/sdk`.
- Bundle: `openchamber-guest-bundle` (Bun). Panel as a browser IIFE, service as Node ESM (`--node`).
- Tests: `bun test`. Typecheck: `tsc --noEmit`.

## Commands

```sh
npm run build      # panel/main.js + service/main.js
npm test           # bun test
npm run typecheck
```

After any change in `src/`, run `npm run build` again: `panel/main.js` and `service/main.js` are shipped as is and must stay in sync with the sources.

Manual service test:

```sh
OPENCHAMBER_SERVICE_PORT=47999 OPENCHAMBER_SERVICE_TOKEN=t node service/main.js &
curl -H 'Authorization: Bearer t' 'http://127.0.0.1:47999/log?dir=/path/to/repo&limit=5'
```

## Conventions

### Service (`src/service.ts`)

1. **Read-only**: only git commands that write nothing. Never a shell: `execFile` with an argument array.
2. `dir` is validated by `checkRepository` before any route. Every new route goes through `ROUTES`.
3. Errors use the `{ error, message }` format via `fail()`, with codes listed in `Failure` and `STATUS`.
4. Every added or changed route is documented in the `README.md` table.

### Panel (`src/panel/`)

1. `@openchamber/sdk/ui` components first (`mountButton`, `mountTabs`, `mountBanner`…). Styles live in `STYLE` (`view.ts`), using only the theme's `--oc-*` variables.
2. **All visible text goes through `t()`**; every key exists in English and French (the `i18n.test.ts` test checks it). Remove a key that is no longer used from both dictionaries.
3. Errors are kept as a `Problem` (i18n keys, no hard-coded text) so they can be translated again when the language changes.
4. Every async request checks `generation` before writing state: a stale response is ignored.
5. A failed service is restarted only on user action ("Retry"), never in a silent loop (`GUEST_SERVICES.md`).
6. No modals. No translate, scale or rotate on hover: color, opacity, shadow or border only.

### Pure logic

Testable logic (lanes, log parsing, i18n) lives outside the DOM, in modules covered by `test/`. Add a test for any new decision logic.

## Git

- No commits by the agent: the user commits themselves.
- Commit messages follow Conventional Commits (`feat(panel): …`).
