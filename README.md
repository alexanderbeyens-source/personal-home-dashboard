# Northstar · Personal Home Dashboard

A responsive personal dashboard for live weather, headlines, sports scores, daily reference exchange rates, and optional calendar/Home Assistant connections.

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

Do not make the service public without authentication. All API routes require the allow-listed GitHub account; only `/healthz` and the OAuth flow are unauthenticated. A Smart TV browser must support GitHub sign-in to use the service.

## Live data and integrations

- Weather: Open-Meteo, using the coordinates in `.env`.
- Headlines: BBC RSS feeds for world, technology, and business news.
- Sports: ESPN's public NBA and Premier League scoreboards; NBA news is also from ESPN. The Premier League standings link opens the league's live table.
- Finance: Frankfurter's daily EUR reference rates (based on ECB data). No bank connection or personal account balances.
- Calendar: set `CALENDAR_ICS_URL` to a calendar's private/unlisted ICS feed URL. It remains on the server.
- Smart home: set `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN`. The token remains on the server.
- Projects: set `PROJECTS_JSON`, for example `[{\"name\":\"Portfolio\",\"url\":\"https://example.com\",\"description\":\"Personal site\"}]`.

The calendar and Home Assistant cards show a connection state until configured. No fake/sample headlines, scores, events, or balances are used. Providers can rate-limit or change their public endpoints, so unavailable live sources are shown as errors rather than replaced with sample values.

Keep `.env` private and never commit real calendar URLs, Home Assistant tokens, or other credentials.
