# Northstar · Personal Home Dashboard

A responsive personal dashboard for live weather, headlines, sports scores, daily reference exchange rates, and optional calendar/Home Assistant connections. The user interface is in Dutch (`nl-BE` date formatting; numbers still use a decimal point); news articles are shown in their original language.

## Run locally

1. Install Node.js 20.19+ and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Create a GitHub OAuth App for local development. Set its callback URL to `http://localhost:5173/api/auth/callback/github`, then set `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, your numeric `ALLOWED_GITHUB_ID`, and `AUTH_SECRET` in `.env`. Generate the secret with `openssl rand -base64 32`.
4. In one terminal run `npm run server`.
5. In another terminal run `npm run dev`, then open the address printed by Vite (usually `http://localhost:5173`).

The development server forwards `/api` requests to the local Node server. For local OAuth, set `AUTH_URL=http://localhost:5173`. The server refuses protected API access until the authentication settings are valid.

## Use from GitHub Codespaces

For development, start the backend and frontend in separate terminals:

```sh
npm run server
npm run dev
```

In the Codespaces **Ports** tab, forward port **5173** and keep its visibility **Private**. Open the forwarded 5173 URL on your iPhone or iPad while signed in to GitHub. The Vite proxy sends `/api` requests to the backend inside the Codespace, so you do not need to forward port 3001 for development. Vite allows only the current Codespace's `-5173.app.github.dev` hostname.

## Deploy to Render

The root `render.yaml` defines one Free Node Web Service connected to this repository's `main` branch. In Render, create a **Blueprint** from the GitHub repository and review the service before creating it. Render supplies `PORT`; the server binds to `0.0.0.0`. The health check uses `/healthz`. The Node.js version is pinned to the 24.x line via `engines` in `package.json`, which Render reads at build time; use Node 24 locally as well.

The Blueprint uses:

```sh
npm ci && npm run build
npm run server
```

Before the first deploy:

1. Create a GitHub OAuth App with callback URL `https://YOUR-SERVICE.onrender.com/api/auth/callback/github`.
2. In Render's service environment settings, set `AUTH_URL` to `https://YOUR-SERVICE.onrender.com`, and supply `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and your numeric `ALLOWED_GITHUB_ID`. Render generates `AUTH_SECRET` from the Blueprint.
3. Optionally set `WEATHER_LAT`, `WEATHER_LON`, and `WEATHER_LOCATION`; `CALENDAR_ICS_URL`, `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`, `PROJECTS_JSON` and the `SMARTCAR_*` variables are only needed for those integrations. Keep secrets and private URLs in Render's environment settings, never in the repository.

The app uses no database or persistent filesystem storage. Render Free services sleep after 15 minutes without traffic and take about a minute to wake. Home Assistant must be reachable from Render; a LAN-only instance will not work, and should not be exposed directly just to connect it.

The default weather location is Diest. Override `WEATHER_LAT`, `WEATHER_LON`, and `WEATHER_LOCATION` in the server environment to use another location.

Do not make the service public without authentication. All API routes require the allow-listed GitHub account; only `/healthz` and the OAuth flow are unauthenticated. A Smart TV browser must support GitHub sign-in to use the service.

## Pages

`/` overview (briefing top 3, weather, agenda, sport and economy summaries) · `/briefing` full daily briefing · `/agenda` the next 14 days from all calendars · `/news` news centre · `/sport/<league>` full standings, fixtures, news and player lines · `/economie` full economic cockpit · `/weer` detailed forecast · `/taken` task list · `/gezondheid` health data. The server falls back to `index.html` for these paths.

## Live data and integrations

- Weather: one Open-Meteo forecast call (current, 7 days hourly and daily, local time zone) for the coordinates in `.env`. The dashboard shows the current conditions, morning (06–12), afternoon (12–18) and evening (18–24) averages for today and the next three days; `/weer` adds a 48-hour temperature and rain-probability chart, a seven-day table, UV and sunrise/sunset. Missing hourly values are shown as unavailable, never as zero.
- Headlines: the protected `/api/news` route aggregates VRT NWS, BBC News, The Guardian, Ars Technica, BBC Technology, MIT Technology Review, BBC Business, De Tijd, Simon Willison, GitHub Changelog, ESPN NBA News, BBC Sport's Premier League feed, and selected Sporza Belgian-football stories. VRT NWS (Dutch headlines feed) is the Belgian general-news source; RTBF Belgique is not an active source. The dashboard news list shows up to five balanced headlines. `/news` provides category, source, publication-date, and relevance/recency sorting. Relevance is a deterministic ranking using a 72-hour time decay, source type, feed position, and a small set of explicit high-impact headline terms; it does not display a numeric score. Feeds are fetched server-side, cached in memory, and isolated so one unavailable source does not block the rest. Legacy `world`, `technology`, and `business` category requests remain supported.
- Reuters: an official public Reuters RSS feed could not be confirmed. A live Google News RSS candidate returned recent Reuters-attributed headlines, dates, and a Reuters publisher label, but its article links resolve only to Google News and its source metadata links to the Reuters homepage. It is not enabled because an original Reuters article URL cannot be reliably retained.
- Sports: `/api/sport/<nba|pro-league|premier-league>` (full detail) and `/api/sport/<league>/overview` (dashboard) combine ESPN's public standings, scoreboards (soccer per month, NBA in a seven-day window) and competition news with the existing Sporza and BBC feeds, plus the latest ESPN game log lines of Toumani Camara (POR) and AJ Mitchell (OKC). The dashboard widget shows the last three results, the next three fixtures and the top five per competition; on the NBA tab only the Lakers, Trail Blazers and Thunder games are listed. These ESPN endpoints are public but undocumented. The older routes used by the briefing remain: ESPN's public NBA and Premier League scoreboards; NBA news is also from ESPN. Sporza's Dutch Atom feed is filtered by its explicit `Jupiler Pro League` and `Rode Duivels` tags, keeping its general sports coverage out of Belgian football. The Premier League standings link opens the league's live table.
- Daily briefing: the dashboard combines relevant, deduplicated headlines with ESPN scores, tagged Sporza reports, selected material movements in official economic indicators, ECB-based reference rates, the configured ICS agenda, and Open-Meteo weather. It uses source-provided summaries and links, calls out unavailable or stale feeds, and is generated server-side with a 15-minute in-memory cache plus an explicit refresh. It uses deterministic selection and extractive summaries, not an external AI service.
- Economic cockpit: Frankfurter's daily EUR reference rates; ECB policy rates and Belgian new-housing-loan rates; World Bank annual global real GDP growth; Eurostat Belgian and euro-area HICP; Eurostat Belgian household electricity and natural-gas prices; and an IMIE quote: the delayed Xetra price from Deutsche Börse (same fund, ISIN IE00B3YLTY66, ticker SPYI) with the SPDR issuer's official daily closing price as fallback. Official rates/inflation/mortgage/energy/GDP series include compact history and frequency labels. Energy is a household consumer price for stated consumption bands, including taxes and levies, not a wholesale quote. Mortgage data is a historical average, not a bank offer. Source-specific caches retain the last successful observation on temporary failures.
- IMIE chart (`/api/economy/imie-history?range=1d|5d|1m|3m|6m|ytd|1y|3y|5y|10y`): 1D uses today's delayed Xetra trades (5-minute points; change versus the previous session's last trade). 5D–10J use the issuer's official daily NAV history (State Street SPDR xlsx, in USD, read with a small built-in zip/xlsx reader) converted to EUR with the ECB reference rate of the same or previous business day (Frankfurter), adjusted for share splits (1:25 on 2026-02-23) and reduced to at most 260 points. NAV in EUR can differ slightly from the Xetra price. Both sources are cached (NAV and FX 6 h; intraday 60 s while Xetra trades) with last-known-good fallback, and each range is labelled with its basis and source.
- Market-data limitation: a clearly documented, free, reliable broad-market index API was not available, so no standalone market index is shown. IMIE uses Deutsche Börse's public but undocumented quote endpoint (no key; about 15 minutes delayed; cached 60 s during Xetra trading hours and 30 min otherwise) and is always labelled as delayed, never as live. If that endpoint changes or fails, the issuer's closing price is shown instead. It is a global-equity ETF quote, not an index level. No portfolio holdings, balances, or personal returns are inferred.
- Calendars: set `CALENDAR_ICS_URLS` to a JSON list of `{ "name", "url", "color"? }` (up to 12; `webcal://` links are accepted), or the older single `CALENDAR_ICS_URL`. Each feed is fetched server-side (https only, max 5 MB, own 5-minute cache with last-known-good fallback), recurring events (`RRULE`, `EXDATE`, moved or cancelled occurrences) are expanded with `ical.js` for the next 14 days, and a failing calendar is reported by name without hiding the others. The URLs never reach the browser or error messages. If the value of `CALENDAR_ICS_URLS` is invalid, the agenda shows why (curly quotes, quotes around the whole value, missing `[ ]`, missing `url` field, an invalid link for calendar N, …) and the log shows `kind=config reason=…`; neither contains the configured links. A correct value looks like `[{"name":"Gezin","url":"webcal://…"}]` with straight quotes.
  - iCloud: in the Calendar app (or icloud.com/calendar) open a calendar's sharing settings, enable **Public Calendar** and copy the link; repeat per calendar. Anyone who has such a link can read that calendar, so treat it as a secret and only store it in Render's environment. Turning **Public Calendar** off again invalidates the link.
- Smart home: set `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN`. The token remains on the server.
- Projects: set `PROJECTS_JSON`, for example `[{\"name\":\"Portfolio\",\"url\":\"https://example.com\",\"description\":\"Personal site\"}]`.

The calendar and Home Assistant cards show a connection state until configured. No fake/sample headlines, scores, events, or balances are used. Providers can rate-limit or change their public endpoints, so unavailable live sources are shown as errors rather than replaced with sample values.

## Task list

Tasks live in a Markdown file in a private GitHub repository, so you can edit them by hand or ask Claude (Claude Code, or Claude.ai with the GitHub connector) to add, change or remove tasks. The dashboard reads the file (60-second cache), can tick tasks off and add new ones (on the dashboard and on `/taken`); every tick or new task is a normal commit in that repository. Start from `docs/tasks.example.md`.

- Sections `## Dagelijks`, `## Wekelijks`, `## Maandelijks` and `## Eenmalig`; other headings and text are left untouched.
- `- [x] Task (2026-11-24)` records when a task was last done. A recurring task counts as done when that date is in the current day, week (Monday to Sunday) or month, so daily/weekly/monthly tasks reopen by themselves. `@2026-12-01` in a task is a deadline; overdue deadlines are highlighted.
- Setup: create a private repo (for example `northstar-tasks`) with `tasks.md`, create a **fine-grained** personal access token limited to that one repository with *Contents: read and write*, and set `GITHUB_TASKS_TOKEN`, `GITHUB_TASKS_REPO` (`owner/repo`) and optionally `GITHUB_TASKS_PATH` in Render. The token stays on the server.
- Security: `POST /api/tasks/toggle` and `POST /api/tasks/add` are the only state-changing routes. Both go through the same check: the allow-listed session, an `Origin` equal to `AUTH_URL`, Auth.js's double-submit CSRF token in the JSON body, a body of at most 2 kB and their own rate limit (30/min). Toggle can only flip one existing checkbox line. Add inserts one new single-line `- [ ] …` task (at most 300 characters, newlines and control characters removed, optional `@date` deadline only for `Eenmalig`) after the last task of the chosen section, or appends that section heading if it is missing. Neither route can delete or rewrite other content.

## Health data (Garmin via intervals.icu)

Garmin's official Health API is only available to businesses, and Apple Health has no web API, so Northstar reads Garmin data through [intervals.icu](https://intervals.icu/) (free), which syncs with Garmin Connect.

- Data: per day sleep duration, sleep score, resting heart rate, HRV and steps for the last 14 days (`/api/v1/athlete/{id}/wellness`), plus the latest activities of the last 30 days (`/activities`). Field names follow intervals.icu's OpenAPI spec. Values that are missing or zero are shown as "niet beschikbaar", never as 0. Cached 30 minutes with last-known-good fallback; if one of the two calls fails, the other still shows.
- Setup: create an intervals.icu account, connect Garmin in its settings with wellness sync enabled, create an API key under *Settings → Developer settings*, and set `INTERVALS_ATHLETE_ID` (e.g. `i12345`) and `INTERVALS_API_KEY` in Render. The key is sent only to intervals.icu (HTTP basic auth, username `API_KEY`) and never reaches the browser. If only some wellness fields arrive, reconnecting Garmin in intervals.icu usually helps.
- Apple Health was evaluated and not implemented: it would need a paid forwarding app on the iPhone plus persistent storage, which Northstar does not have.

## Duolingo (unofficial public profile)

Duolingo has no official public API. Northstar reads the streak and XP from the unofficial, undocumented endpoint behind duolingo.com profile pages (`https://www.duolingo.com/2017-06-30/users?username=…`). It needs no login, token or password, only the username of a **public** profile.

- Data: current streak and its start date, whether today's lesson is done (the streak's last day is today), still to do (yesterday) or the streak is broken, total XP, the current course and up to five courses by XP. All other profile fields are dropped on the server. Missing values are shown as "niet beschikbaar", never as 0. Cached 15 minutes with last-known-good fallback (then labelled stale).
- Setup: make sure the Duolingo profile is public and set `DUOLINGO_USERNAME` in Render. Only the username is sent to duolingo.com; nothing reaches the browser except the mapped values and a link to the profile.
- Caveat: because the endpoint is unofficial it can change, be rate limited or blocked without notice. Northstar then shows an error or stale state; remove `DUOLINGO_USERNAME` to hide the data.

## Vehicle (Mercedes-Benz via Smartcar, read-only)

The dashboard card **Auto** shows the battery percentage, range, whether the car is charging or the cable is connected, when the car last reported these values and when Northstar last fetched them. It uses [Smartcar](https://smartcar.com), an official partner of Mercedes-Benz Connectivity Services, on the Smartcar Free plan (1 vehicle, $0). Only signals are read; no commands (charging, locks, location) are requested or sent.

- API: Smartcar Vehicles API **v3** (v2.0 is deprecated on 1 December 2026). The server requests an application token with the client credentials (valid 1 hour, no refresh token) and finds the connected vehicle via `GET /v3/connections`. The connection itself is stored by Smartcar, so nothing has to be stored by Northstar and a Render restart or sleep does not lose the link. The client secret and tokens stay on the server and are never logged or sent to the browser.
- Data: `tractionbattery-stateofcharge`, `tractionbattery-range`, `charge-ischarging` and `charge-ischargingcableconnected`, read with one list call (single-signal calls only if battery or range are missing). Missing values are shown as "niet beschikbaar", never as 0.
- Fetching: only when the dashboard is opened, with a 60-minute in-memory cache; the refresh button fetches again at most once per 5 minutes. No background polling and no webhooks. On a failure (car asleep or unreachable, rate limit, plan limit) the last valid value is shown as stale with its time; without an earlier value the card shows that the data is temporarily unavailable, and Northstar waits at least 5 minutes (or Smartcar's `retry-after`) before trying again. After a Render restart the last valid value is gone until the next successful fetch.
- States: "niet gekoppeld" (with a **Auto koppelen** button), "opnieuw autoriseren nodig" (connection `DISABLED`, a Smartcar re-authentication error, or no usable signal while Smartcar asks to re-authenticate; a `DEGRADED` connection is still read, and the reason is logged as a `Smartcar diagnostic: reauth_required …` line with fixed codes only) and "data tijdelijk niet beschikbaar". The card stays hidden until the three variables are set.
- Connect flow: `/api/smartcar/connect` redirects to Smartcar Connect (`response_type=none`, `mode=live`, no code exchange) with a signed, single-use `state` (15 minutes). `/api/smartcar/callback` checks that state and redirects back to the dashboard. Both, and `/api/vehicle`, require the allow-listed GitHub session.

Setup (once):

1. In the Smartcar dashboard, under **Vehicle Access**, select only state of charge, range, charging status and charging cable connected. Do not select location or any command.
2. Under **API Credentials**, create a client secret (shown once) and copy the client ID and secret directly into Render.
3. Add the redirect URI `https://YOUR-SERVICE.onrender.com/api/smartcar/callback` (the same address as `AUTH_URL`).
4. In Render, set `SMARTCAR_CLIENT_ID`, `SMARTCAR_CLIENT_SECRET`, `SMARTCAR_REDIRECT_URI` (the URI from step 3) and `SMARTCAR_APPLICATION_ID` (under **Configuration → Application details**; not a secret). The server rejects a redirect URI that does not point to `/api/smartcar/callback` on `AUTH_URL`.
5. Open the dashboard, tap **Auto koppelen**, sign in with the Mercedes me account and approve. Mercedes me connect services must be active.

The Connect URL needs the Application ID, which differs from the client ID for client IDs of the form `client_…`. `SMARTCAR_APPLICATION_ID` is optional only for older apps where both are the same value; without it the client ID is used. The card stays hidden until the client ID, secret and redirect URI are set.

## Mobility & Home · Phase 3 assessment (revised 25 November 2026)

This section records the integration-availability assessment. The Mercedes-Benz route has since been implemented as the read-only **Auto** card (see above and functional analysis section 13.7, decision of 25 November 2026). The Dreame robot remains outside the user interface: the former `/mobility` page stays removed and no Dreame data is contacted or simulated. This revision supersedes the assessment of 23 November 2026, which was outdated on two points: an official partner route now exists for Mercedes-Benz EVs in Europe, and the Dreame L50s Pro Ultra is Matter-certified.

| Area | Mercedes-Benz CLA 250+ (2026, Europe) | Dreame L50s Pro Ultra |
| --- | --- | --- |
| Feasibility status | **Implemented** (read-only, Smartcar Vehicles API v3) after the owner confirmed VIN compatibility and that state of charge and range are in the Free plan | Feasible only with a local controller at home; no supported €0 cloud-only route |
| Candidate route | Smartcar, official partner of Mercedes-Benz Connectivity Services (announced September 2025, available in Europe since 15 December 2025). Supports BEV and PHEV for new connections in, among others, Belgium and the Netherlands. | Matter (certified: CSA252E1MAT45619-24, 21 May 2025, Matter 1.4, family variant SKU "L50s Pro Ultra R2508"). Matter is local-network only, so Northstar on Render needs a home controller with its own API (Home Assistant, Homey Pro or SmartThings). |
| Data exposed | Charge (cable connected, charging status, timers, limit, time to complete, wattage), traction battery (state of charge, range, nominal capacity), precise location, odometer. Free plan has "limited vehicle signals"; exact coverage must be verified in the Smartcar dashboard. | Via Matter: operational state, run mode, clean mode, service area (rooms). Battery level, consumables and cleaning history are not confirmed via Matter; these are only available through the community cloud integration. |
| Authentication and user actions | Smartcar developer account (free); OAuth consent with Mercedes me account; VIN entry required by Mercedes during connection. Mercedes me connect services must be active; whether a paid subscription is required was not documented. | Matter pairing code from the Dreamehome app (Device settings → Smart Home Integration → Matter), paired with a Matter controller. Controller exposes data via its own API/token. |
| Cost | Smartcar Free: $0, 1 real vehicle, no credit card. Smartcar Build: from $1.99 per vehicle per application per month (only if Free-plan signals are insufficient). | Home Assistant Green €179 one-off, remote access via free Cloudflare Tunnel or Home Assistant Cloud from $6.50/month; Homey Pro mini €279 one-off; SmartThings €0 if a compatible Samsung TV/hub is already present. |
| Render Free fit and limitations | Fetch on dashboard open with a 60-minute in-memory cache; no webhooks (missed while the service sleeps). The refresh-token storage issue is resolved by v3: application tokens (client credentials, 1 hour) are requested again after a restart and the connection is stored by Smartcar. | Northstar would read from the home controller over HTTPS. SmartThings tokens expire after ~24 hours and need refresh-token persistence, same storage issue. |
| Rejected alternatives | Mercedes developer portal direct: connected-vehicle API pricing is "contact sales"; BYOCAR is a test option, not a permanent personal-use plan. High Mobility: monthly per-vehicle fee and B2B application review. mbapi2020 (Home Assistant community): supports CLA 2025+, but has had login-flow changes (passkeys), an SSL error since 23 July 2026, and a maintainer handover. | Direct Dreame cloud from Node: undocumented protocol, password stored on Render, breaks on cloud changes. Valetudo: model not found on the supported-robots list; rooting voids warranty. Apple Home: no public API. |
| Decision | Implemented on 25 November 2026 with the owner's approval (option A: v3 application tokens, Free plan only, no extra storage or service). | Not implemented. Reassess only if the owner approves a one-off hardware purchase (Home Assistant Green recommended, as it can also host Mercedes integration) and revises the out-of-scope rule for Home Assistant. |

Research references, checked 25 November 2026:

- [Smartcar × Mercedes-Benz Connectivity Services partnership](https://smartcar.com/blog/smartcar-partners-with-mercedes-benz-connectivity-services-gmbh)
- [Smartcar Mercedes integration details (regions, powertrains, signals, VIN step)](https://smartcar.com/docs/help/oem-integrations/mercedes/whats-new)
- [Smartcar pricing](https://smartcar.com/pricing)
- [Mercedes-Benz connected-vehicle API pricing ("contact sales") and BYOCAR](https://data.mercedes-benz.com/products/vehicle-status)
- [High Mobility Mercedes-Benz requirements](https://docs.high-mobility.com/guides/platform/daimler)
- [mbapi2020 community status](https://community.home-assistant.io/t/mercedes-me-component/41911)
- [Dreame Matter certification (L50s Pro Ultra R2508)](https://www.matteralpha.com/dreame/dreame-robot-vacuum-and-mop-p2974)
- [Home Assistant Green pricing](https://www.nabucasa.com/news/2026-01-08-green-pricing-change/)
- [Homey Pro mini](https://homey.app/en-nl/homey-pro-mini/)
- [SmartThings token lifetime](https://developer.smartthings.com/docs/getting-started/authorization-and-permissions)
- [Smartcar v3 application token (client credentials, 1 hour, no refresh token)](https://smartcar.com/docs/api-reference/authorization/request-access-token)
- [Smartcar Connect (`response_type=none`) and its response](https://smartcar.com/docs/connect/redirect-to-connect)
- [Smartcar connections, signals and rate limits](https://smartcar.com/docs/api-reference/list-connections), [signals](https://smartcar.com/docs/api-reference/list-signals), [API limits](https://smartcar.com/docs/help/api-limits)

Keep `.env` private and never commit real calendar URLs, Home Assistant tokens, or other credentials.

Run the focused automated regression suite with `npm test`.
