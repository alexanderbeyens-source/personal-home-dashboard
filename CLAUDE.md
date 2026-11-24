# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Northstar is a single-user personal dashboard (weather, news, daily briefing, sports, economic indicators, optional calendar/Home Assistant/projects). React 19 + Vite frontend in `src/`, a dependency-light plain-Node (ESM, no framework) backend in `server/`. Deployed to Render Free as one web service (`render.yaml`). No database or persistent storage: all caches are in-memory.

`docs/Northstar_2.0_Functionele_Analyse.md` (Dutch) is the functional spec / PRD. Its stated precedence: the user's latest explicit decision > current code/config > the spec > historical implementation reports. Ask the user before changes that affect cost, security, infrastructure, OAuth, data loss, or external account access.

## Workflow and permissions

Details: `docs/Northstar_2.0_Functionele_Analyse.md` — §15 (cost, autonomy, permissions), §16.1 (Definition of Done), §17 (release), §22 (instructions for agents).

- **Audit → plan → implement.** Start every task with a read-only audit (code, branch/commit, config, `package.json` scripts, tests, `render.yaml`). Then present a plan: what is done, partial or missing, spec–code deviations, risks, and anything affecting cost, infrastructure or security. Implement only after the user confirms the scope. Never start the next phase on your own (§15.4).
- **Ask for explicit permission first (§15.3)** for: paid services, subscriptions or APIs; new infrastructure or hosting; a new database or migration; OAuth/authentication changes; changes to the security model or secrets; destructive changes or data loss; actions on external accounts or physical devices; changes that could substantially disrupt production.
- **No paid services or new infrastructure** without that permission. Stay on Render Free at €0 extra cost (§15.1).
- **Never commit or display secrets**: not in code, commits, logs, error messages, frontend bundles or chat output. `.env.example` holds placeholders only. Check `git status` and the diff for `.env` files or credentials before every commit (§12.6).
- **Only use scripts defined in `package.json`** (`dev`, `server`, `test`, `build`, `preview`). Don't invent scripts or tools.
- **All changes go through a branch and pull request.** Never commit or push directly to `main`: a push to `main` auto-deploys to Render. Before opening the PR, run `npm test`, `npm run build` and `git diff --check` (§16.1, §17.1). This overrides the push-to-`main` flow described in §12.1/§17.2.

## Commands

```sh
npm install
npm run server        # backend on :3001 (reads .env via process.loadEnvFile)
npm run dev           # Vite on :5173, proxies /api -> localhost:3001
npm test              # vitest run (all tests, server + frontend)
npm test -- server/news.test.js              # single file
npm test -- -t "partial test name"           # single test by name
npm run build         # tsc -b && vite build -> dist/
```

There is no linter configured; `tsc -b` (part of `build`) is the type check for `src/`. `server/` is plain JS and not type-checked.

Local dev needs a working `.env` (copy `.env.example`): `AUTH_URL`, `AUTH_SECRET` (≥32 chars), `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, numeric `ALLOWED_GITHUB_ID`. Without valid auth config the server starts but every `/api/*` route returns 503 and `/healthz` reports `not_ready`. In Codespaces, Vite only allows the `$CODESPACE_NAME-5173.app.github.dev` host (`vite.config.ts`).

## Architecture

### Server (`server/index.js`)
A single `node:http` handler does everything, in this order:
1. Security headers (CSP etc.) on every response.
2. `/healthz` — unauthenticated.
3. `/api/auth/*` — delegated to `@auth/core` (GitHub provider, JWT sessions, 8h). Sign-in is rejected unless the GitHub profile id equals `ALLOWED_GITHUB_ID`; the JWT is stripped down to just `githubUserId`.
4. Other `/api/*` — GET only, per-IP rate limit, session required, then `routeApi(url)`. Returning `null` from a route means 404. Thrown errors with `status < 500` expose their message; ≥500 return a generic message and are logged via `logFetchFailure` (`server/fetch-errors.js`).
5. Everything else — static files from `dist/` with SPA fallback to `index.html` (path-traversal guarded).

`routeApi` wraps `routeApiUncached` with a per-path TTL cache + in-flight dedup (`sharedApiRouteTtl`); `?refresh=1` bypasses it. `/api/news` and `/api/briefing` skip this layer because their services cache internally. New API routes go as `if (url.pathname === ...)` branches in `routeApiUncached`; add a TTL entry if they should be shared-cached.

Domain logic lives in separate, unit-tested modules built as factories with injected dependencies (fetchers, `now`) so tests run without network:
- `news.js` — `NEWS_SOURCES` registry (RSS/Atom/ESPN JSON), parsing, URL canonicalization, dedup, deterministic relevance score (72h decay, source type, feed position, keyword boosts), per-source isolation so one failing feed doesn't break others.
- `economics.js` — `createEconomicLoaders` (Frankfurter, ECB, World Bank, Eurostat, IMIE issuer close + delayed Xetra quote) + `createEconomicsService` with per-source last-known-good caching (`ttlMs` may be a function of time).
- `sports.js` — `createSportsService` for `/api/sport/<league>[/overview]`: ESPN standings, fixtures, news and NBA player game logs, each cached separately with last-known-good fallback.
- `briefing.js` — `composeDailyBriefing` combines news, sports, economics, calendar, weather into an extractive, deterministic briefing (15-min cache). No LLM/AI API.
- `data.js` — ESPN sports mapping.

Outbound fetches go through `fetchJson`/`fetchText`/`readLimitedBody` in `index.js` (timeouts and response size limits) — reuse them for new sources. Failures are logged only as a fixed classification (`kind=http status=503`, `kind=timeout`, `kind=network code=ENOTFOUND`, …) with a fixed label: never log `error.message`, `error.input` or URLs, because calendar links and tokens are secrets. Tag errors you throw with `upstreamError(message, { status | kind })`.

`server/security.test.js` spawns the real server on a random port with dummy auth env and asserts API routes are protected; keep it passing when touching request handling.

### Frontend (`src/`)
- No router library: `App.tsx` checks `/api/auth/session`, shows the GitHub sign-in screen if unauthenticated, then picks a page from `src/pages/` by `window.location.pathname` (`/briefing`, `/news`, `/sport/<league>`, `/economie`, else `Dashboard`). Every page renders inside `AppShell` (header + nav); shared widgets live in `src/components/` (`briefing`, `sports`, `economy`), and nl-BE date/number formatting in `src/format.ts`.
- Data fetching uses `useLiveResource<T>(url, refreshInterval, refreshUrl)` (`src/hooks/`), which handles polling, abort, in-flight dedup, and `loading`/`refreshing`/`error`/`updatedAt` state; render it via `Panel`/`ResourceState` (`src/components/Panel.tsx`).
- API response shapes are in `src/types.ts` and must match what `server/` returns.
- Styling is one token-based `src/styles.css` (orange accent `--accent`, no green/yellow for status; text colours ≥ 4.5:1 on panels; metadata ≥ 13 px).
- Mercedes / Dreame integrations were evaluated and deliberately **not** implemented — don't add device adapters or credentials without the user's decision.

## Product rules (from README/spec)

- Never fabricate or use sample data (headlines, scores, events, balances, summaries, dates). Unavailable sources show an error/stale state, not placeholder values; missing values are not shown as zero; stale data is not labeled live.
- Always keep the original source article link (this is why Reuters via Google News was rejected).
- No generative-AI API dependency (§2.4). Must keep working on Render Free (sleeps after 15 min; in-memory cache is lost on wake).
- Secrets (ICS URL, HA token, OAuth secrets) stay server-side only; never sent to the browser or committed.
- Every API route except `/healthz` and the OAuth flow must stay behind the allow-listed GitHub session.
