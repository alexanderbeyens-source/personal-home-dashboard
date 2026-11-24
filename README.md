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

The root `render.yaml` defines one Free Node Web Service connected to this repository's `main` branch. In Render, create a **Blueprint** from the GitHub repository and review the service before creating it. Render supplies `PORT`; the server binds to `0.0.0.0`. The health check uses `/healthz`.

The Blueprint uses:

```sh
npm ci && npm run build
npm run server
```

Before the first deploy:

1. Create a GitHub OAuth App with callback URL `https://YOUR-SERVICE.onrender.com/api/auth/callback/github`.
2. In Render's service environment settings, set `AUTH_URL` to `https://YOUR-SERVICE.onrender.com`, and supply `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and your numeric `ALLOWED_GITHUB_ID`. Render generates `AUTH_SECRET` from the Blueprint.
3. Optionally set `WEATHER_LAT`, `WEATHER_LON`, and `WEATHER_LOCATION`; `CALENDAR_ICS_URL`, `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`, and `PROJECTS_JSON` are only needed for those integrations. Keep secrets and private URLs in Render's environment settings, never in the repository.

The app uses no database or persistent filesystem storage. Render Free services sleep after 15 minutes without traffic and take about a minute to wake. Home Assistant must be reachable from Render; a LAN-only instance will not work, and should not be exposed directly just to connect it.

The default weather location is Diest. Override `WEATHER_LAT`, `WEATHER_LON`, and `WEATHER_LOCATION` in the server environment to use another location.

Do not make the service public without authentication. All API routes require the allow-listed GitHub account; only `/healthz` and the OAuth flow are unauthenticated. A Smart TV browser must support GitHub sign-in to use the service.

## Pages

`/` overview (briefing top 3, weather, agenda, sport and economy summaries) · `/briefing` full daily briefing · `/news` news centre · `/sport/<league>` full standings, fixtures, news and player lines · `/economie` full economic cockpit · `/gezondheid` health data. The server falls back to `index.html` for these paths.

## Live data and integrations

- Weather: Open-Meteo, using the coordinates in `.env`.
- Headlines: the protected `/api/news` route aggregates VRT NWS, BBC News, The Guardian, Ars Technica, BBC Technology, MIT Technology Review, BBC Business, De Tijd, Simon Willison, GitHub Changelog, ESPN NBA News, BBC Sport's Premier League feed, and selected Sporza Belgian-football stories. VRT NWS (Dutch headlines feed) is the Belgian general-news source; RTBF Belgique is not an active source. The dashboard news list shows up to five balanced headlines. `/news` provides category, source, publication-date, and relevance/recency sorting. Relevance is a deterministic ranking using a 72-hour time decay, source type, feed position, and a small set of explicit high-impact headline terms; it does not display a numeric score. Feeds are fetched server-side, cached in memory, and isolated so one unavailable source does not block the rest. Legacy `world`, `technology`, and `business` category requests remain supported.
- Reuters: an official public Reuters RSS feed could not be confirmed. A live Google News RSS candidate returned recent Reuters-attributed headlines, dates, and a Reuters publisher label, but its article links resolve only to Google News and its source metadata links to the Reuters homepage. It is not enabled because an original Reuters article URL cannot be reliably retained.
- Sports: `/api/sport/<nba|pro-league|premier-league>` (full detail) and `/api/sport/<league>/overview` (dashboard) combine ESPN's public standings, scoreboards (soccer per month, NBA in a seven-day window) and competition news with the existing Sporza and BBC feeds, plus the latest ESPN game log lines of Toumani Camara (POR) and AJ Mitchell (OKC). The dashboard widget shows the last three results, the next three fixtures and the top five per competition; on the NBA tab only the Lakers, Trail Blazers and Thunder games are listed. These ESPN endpoints are public but undocumented. The older routes used by the briefing remain: ESPN's public NBA and Premier League scoreboards; NBA news is also from ESPN. Sporza's Dutch Atom feed is filtered by its explicit `Jupiler Pro League` and `Rode Duivels` tags, keeping its general sports coverage out of Belgian football. The Premier League standings link opens the league's live table.
- Daily briefing: the dashboard combines relevant, deduplicated headlines with ESPN scores, tagged Sporza reports, selected material movements in official economic indicators, ECB-based reference rates, the configured ICS agenda, and Open-Meteo weather. It uses source-provided summaries and links, calls out unavailable or stale feeds, and is generated server-side with a 15-minute in-memory cache plus an explicit refresh. It uses deterministic selection and extractive summaries, not an external AI service.
- Economic cockpit: Frankfurter's daily EUR reference rates; ECB policy rates and Belgian new-housing-loan rates; World Bank annual global real GDP growth; Eurostat Belgian and euro-area HICP; Eurostat Belgian household electricity and natural-gas prices; and an IMIE quote: the delayed Xetra price from Deutsche Börse (same fund, ISIN IE00B3YLTY66, ticker SPYI) with the SPDR issuer's official daily closing price as fallback. Official rates/inflation/mortgage/energy/GDP series include compact history and frequency labels. Energy is a household consumer price for stated consumption bands, including taxes and levies, not a wholesale quote. Mortgage data is a historical average, not a bank offer. Source-specific caches retain the last successful observation on temporary failures.
- Market-data limitation: a clearly documented, free, reliable broad-market index API was not available, so no standalone market index is shown. IMIE uses Deutsche Börse's public but undocumented quote endpoint (no key; about 15 minutes delayed; cached 60 s during Xetra trading hours and 30 min otherwise) and is always labelled as delayed, never as live. If that endpoint changes or fails, the issuer's closing price is shown instead. It is a global-equity ETF quote, not an index level. No portfolio holdings, balances, or personal returns are inferred.
- Calendar: set `CALENDAR_ICS_URL` to a calendar's private/unlisted ICS feed URL. It remains on the server.
- Smart home: set `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN`. The token remains on the server.
- Projects: set `PROJECTS_JSON`, for example `[{\"name\":\"Portfolio\",\"url\":\"https://example.com\",\"description\":\"Personal site\"}]`.

The calendar and Home Assistant cards show a connection state until configured. No fake/sample headlines, scores, events, or balances are used. Providers can rate-limit or change their public endpoints, so unavailable live sources are shown as errors rather than replaced with sample values.

## Health data (Garmin via intervals.icu)

Garmin's official Health API is only available to businesses, and Apple Health has no web API, so Northstar reads Garmin data through [intervals.icu](https://intervals.icu/) (free), which syncs with Garmin Connect.

- Data: per day sleep duration, sleep score, resting heart rate, HRV and steps for the last 14 days (`/api/v1/athlete/{id}/wellness`), plus the latest activities of the last 30 days (`/activities`). Field names follow intervals.icu's OpenAPI spec. Values that are missing or zero are shown as "niet beschikbaar", never as 0. Cached 30 minutes with last-known-good fallback; if one of the two calls fails, the other still shows.
- Setup: create an intervals.icu account, connect Garmin in its settings with wellness sync enabled, create an API key under *Settings → Developer settings*, and set `INTERVALS_ATHLETE_ID` (e.g. `i12345`) and `INTERVALS_API_KEY` in Render. The key is sent only to intervals.icu (HTTP basic auth, username `API_KEY`) and never reaches the browser. If only some wellness fields arrive, reconnecting Garmin in intervals.icu usually helps.
- Apple Health was evaluated and not implemented: it would need a paid forwarding app on the iPhone plus persistent storage, which Northstar does not have.

## Mobility & Home · Phase 3 assessment

This section records an integration-availability assessment only. Per the functional analysis (section 4 and 13.6), Mobility & Home is not part of the user interface: the former `/mobility` page has been removed and no device data is contacted or simulated. No device adapter or credential variable has been added because neither option meets the current requirements for a safe, supported, no-cost, independently verifiable integration.

| Area | Mercedes-Benz CLA 250+ (2026, Europe) | Dreame L50s Pro Ultra |
| --- | --- | --- |
| Feasibility status | **3 · Technically possible, but currently unverified/too uncertain to implement** | **3 · Exact model is community-supported, but current constraints make a direct integration unsuitable** |
| Data exposed by candidate | Mercedes developer API materials describe vehicle status and EV charge data (including state of charge); availability of charge state, range, odometer, power and remaining time varies by API, vehicle and permission. | The Dreame community integration lists the L50s Pro Ultra model codes. Its integration can expose robot status, battery, cleaning/history and consumables, depending on model capabilities. |
| Integration method | Official Mercedes-Benz developer APIs are the only acceptable candidate. The public portal is not evidence that this individual account, EU model year 2026 vehicle or desired read-only fields are currently eligible. | The maintained community integration uses the Dreamehome cloud from **Home Assistant**; its setup requires the app account username/password and matching account region. A direct Node adapter would have to reproduce an undocumented cloud protocol and authentication lifecycle. |
| Compatibility and reliability | Not verified for the 2026 CLA 250+ in Europe. The developer portal/API documentation is not sufficient to confirm current private onboarding or response coverage. Community projects using private Mercedes me endpoints report changing login flows and request limits. | Exact model name and model codes are listed by the community project; actual sensor availability still varies by hardware/firmware. No manufacturer-published public cloud API or confirmed Matter support for this exact model/firmware was found. Matter vacuum-device support in a standard does not itself establish device support. |
| Authentication, cost and user actions | Developer application registration, OAuth and vehicle consent may be needed. Private self-service eligibility and costs were not verified; no credentials have been requested. The user would first need written/current confirmation from Mercedes that the API is offered for personal use and supports this model/market. | Dreamehome account credentials and region are required by the community route; re-authentication may be needed. The community software is available without a paid Northstar service, but a permitted official standalone API and its costs are not documented. Using the existing route would require Home Assistant, which is expressly out of scope. |
| Render Free fit and limitations | Outbound requests are technically possible, but no confirmed supported API/account means deployment is not justified. Free-service sleep and ephemeral in-memory cache also prevent continuous updates and durable last-known-good state. | Outbound cloud requests are technically possible, but the supported adapter depends on Home Assistant and an undocumented cloud connection. Free-service sleep and ephemeral cache further reduce freshness/recovery reliability. |
| Decision | **Not implemented.** Reassess only after official personal-use access, EU/model compatibility, read-only scopes and cost are confirmed. | **Not implemented.** Reassess only if Dreame documents a permitted standalone cloud API or confirms Matter support for this exact device and firmware. |

Research references, checked 23 November 2026:

- [Mercedes-Benz developer portal](https://developer.mercedes-benz.com/) describes its API products as supporting innovative business models. A portal account and product listings alone do not confirm individual-use access or vehicle eligibility.
- [Mercedes community API client](https://github.com/xraver/mercedes_me_api) describes API registration/OAuth requirements; the [ioBroker Mercedes me project](https://github.com/TA2k/ioBroker.mercedesme) documents changing login flows and account request limits. Neither is used by Northstar.
- [Dreame community supported-device list](https://dv.tasshack.com/guide/more/supported-devices) lists the exact L50s Pro Ultra name and model codes.
- [Dreame community account setup](https://dv.tasshack.com/configuration/dreamehome) requires the Dreamehome app username/password, email-based account and matching device region.
- [Dreame community integration source](https://github.com/Tasshack/dreame-vacuum) is a Home Assistant integration, not a standalone Northstar API.

No mobility-related environment variables are required. No Mercedes or Dreame credentials are stored, and there is no background job, persistent state or external connection.

Keep `.env` private and never commit real calendar URLs, Home Assistant tokens, or other credentials.

Run the focused automated regression suite with `npm test`.
