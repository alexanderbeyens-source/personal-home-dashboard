import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { Auth } from "@auth/core";
import GitHub from "@auth/core/providers/github";
import { createDailyBriefingService } from "./briefing.js";
import { loadNbaData, loadNbaPlayers, mapSportsEvents } from "./data.js";
import { createEconomicLoaders, createEconomicsService, isXetraTradingTime } from "./economics.js";
import { createNewsService, isAllowedFeedContentType } from "./news.js";
import { INTERVALS_API, createHealthService, healthConfigFromEnv } from "./health.js";
import { createImieHistoryService } from "./imie-history.js";
import { calendarsFromEnv, createCalendarService, isCalendarConfigured } from "./calendar.js";
import { createSportsService } from "./sports.js";
import { isAllowedOrigin, verifyCsrfToken } from "./csrf.js";
import { createTasksService, tasksConfigFromEnv } from "./tasks.js";
import { WEATHER_CURRENT, WEATHER_DAILY, WEATHER_HOURLY, mapForecast } from "./weather.js";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));

try {
  loadEnvFile(resolve(root, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const port = Number(process.env.PORT || 3001);
const sessionMaxAge = 8 * 60 * 60;
const authRequiredEnv = [
  "AUTH_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "ALLOWED_GITHUB_ID",
  "AUTH_URL",
];
const authMissingEnv = authRequiredEnv.filter((key) => !process.env[key]?.trim());
let authConfig = null;
let sessionCookieName = null;
let csrfCookieName = null;

if (authMissingEnv.length > 0) {
  console.error(`Authentication configuration is missing: ${authMissingEnv.join(", ")}`);
}

if (authMissingEnv.length === 0) {
  try {
    const authUrl = new URL(process.env.AUTH_URL);
    if (
      !["http:", "https:"].includes(authUrl.protocol) ||
      authUrl.pathname !== "/" ||
      authUrl.search ||
      authUrl.hash ||
      (process.env.NODE_ENV === "production" && authUrl.protocol !== "https:") ||
      process.env.AUTH_SECRET.length < 32 ||
      !/^\d+$/.test(process.env.ALLOWED_GITHUB_ID)
    ) {
      throw new Error("Invalid authentication settings.");
    }

    const secureCookie = authUrl.protocol === "https:";
    sessionCookieName = `${secureCookie ? "__Host-" : ""}northstar.session-token`;
    csrfCookieName = `${secureCookie ? "__Host-" : ""}authjs.csrf-token`;
    authConfig = {
      secret: process.env.AUTH_SECRET,
      basePath: "/api/auth",
      trustHost: true,
      useSecureCookies: secureCookie,
      providers: [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
      ],
      session: {
        strategy: "jwt",
        maxAge: sessionMaxAge,
      },
      cookies: {
        sessionToken: {
          name: sessionCookieName,
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: secureCookie,
          },
        },
      },
      callbacks: {
        async signIn({ profile }) {
          return String(profile?.id ?? "") === process.env.ALLOWED_GITHUB_ID;
        },
        async jwt({ token, profile }) {
          const minimalToken = { ...token };
          delete minimalToken.sub;
          delete minimalToken.name;
          delete minimalToken.email;
          delete minimalToken.picture;
          if (profile?.id !== undefined) minimalToken.githubUserId = String(profile.id);
          return minimalToken;
        },
        async session({ session, token }) {
          if (session.user) {
            session.user = { id: String(token.githubUserId ?? "") };
          }
          return session;
        },
      },
    };
  } catch {
    console.error("Authentication configuration is invalid; check AUTH_URL, AUTH_SECRET, and ALLOWED_GITHUB_ID.");
    authConfig = null;
  }
}

const rateLimitBuckets = new Map();
const maxRateLimitBuckets = 5000;

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function applySecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "content-security-policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://github.com",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' https://a.espncdn.com data:",
      "connect-src 'self'",
    ].join("; "),
  );
  if (process.env.NODE_ENV === "production") {
    response.setHeader("strict-transport-security", "max-age=31536000");
  }
}

function clientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedValues = Array.isArray(forwarded) ? forwarded : [forwarded];
  const address = forwardedValues
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .at(-1)
    ?.trim();
  return address || request.socket.remoteAddress || "unknown";
}

function isRateLimited(request, scope, limit, windowMs) {
  const key = `${scope}:${clientAddress(request)}`;
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  bucket.count += 1;
  rateLimitBuckets.delete(key);
  rateLimitBuckets.set(key, bucket);
  if (rateLimitBuckets.size > maxRateLimitBuckets) {
    rateLimitBuckets.delete(rateLimitBuckets.keys().next().value);
  }
  return bucket.count > limit;
}

function sendRateLimitResponse(response) {
  response.writeHead(429, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "retry-after": "60",
  });
  response.end(JSON.stringify({ error: "Te veel verzoeken. Probeer het zo meteen opnieuw." }));
}

function toAuthRequest(request, requestUrl) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (["host", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"].includes(name)) continue;
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }

  const method = request.method ?? "GET";
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request);
    init.duplex = "half";
  }
  return new Request(
    new URL(`${requestUrl.pathname}${requestUrl.search}`, process.env.AUTH_URL),
    init,
  );
}

async function handleAuthRequest(request, response, requestUrl) {
  if (!authConfig) {
    return sendJson(response, 503, { error: "Aanmelden is niet geconfigureerd op deze server." });
  }
  if (isRateLimited(request, "auth", 20, 60_000)) {
    return sendRateLimitResponse(response);
  }
  try {
    const authResponse = await Auth(toAuthRequest(request, requestUrl), authConfig);
    const headers = Object.fromEntries(authResponse.headers.entries());
    const cookies = authResponse.headers.getSetCookie();
    if (cookies.length) headers["set-cookie"] = cookies;
    response.writeHead(authResponse.status, headers);
    response.end(Buffer.from(await authResponse.arrayBuffer()));
  } catch (error) {
    console.error("Authentication handler failed:", error.name);
    sendJson(response, 500, { error: "Authenticatie is tijdelijk niet beschikbaar." });
  }
}

async function getAuthenticatedUser(request) {
  if (!authConfig) return null;
  const headers = new Headers();
  if (request.headers.cookie) headers.set("cookie", request.headers.cookie);
  const sessionRequest = new Request(
    new URL("/api/auth/session", process.env.AUTH_URL),
    { headers },
  );
  const sessionResponse = await Auth(sessionRequest, authConfig);
  if (!sessionResponse.ok) return null;
  const session = await sessionResponse.json();
  if (String(session?.user?.id ?? "") !== process.env.ALLOWED_GITHUB_ID) return null;
  return session.user;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {
      accept: "application/json",
      "user-agent": "NorthstarHomeDashboard/0.1",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Data source returned ${response.status}`);
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {
      accept: "application/rss+xml, application/xml, text/xml, */*",
      "user-agent": "NorthstarHomeDashboard/0.1",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Data source returned ${response.status}`);
  return response.text();
}

async function fetchBuffer(url, maxBytes = 2 * 1024 * 1024) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { accept: "*/*", "user-agent": "NorthstarHomeDashboard/0.1" },
  });
  if (!response.ok) throw new Error(`Data source returned ${response.status}`);
  return readLimitedBody(response, maxBytes, true);
}

async function readLimitedBody(response, maxBytes, asBuffer = false) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Data source response exceeded the size limit.");
  }
  if (!response.body) throw new Error("Data source returned an empty response.");

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Data source response exceeded the size limit.");
    }
    chunks.push(Buffer.from(value));
  }
  const body = Buffer.concat(chunks, totalBytes);
  return asBuffer ? body : body.toString("utf8");
}

// Calendar feeds can be large; limit size and only follow https redirects. The URL
// itself is a secret and is never included in errors.
async function fetchCalendarText(url) {
  let currentUrl = new URL(url);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { accept: "text/calendar, */*", "user-agent": "NorthstarHomeDashboard/0.1" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirectCount === 3) throw new Error("Agenda gaf een ongeldige doorverwijzing.");
      const next = new URL(location, currentUrl);
      if (next.protocol !== "https:" || next.username || next.password) throw new Error("Agenda verwees naar een onveilige link.");
      currentUrl = next;
      continue;
    }
    if (!response.ok) throw new Error(`Agenda gaf status ${response.status}.`);
    return readLimitedBody(response, 5 * 1024 * 1024);
  }
  throw new Error("Agenda overschreed het aantal doorverwijzingen.");
}

const calendarService = createCalendarService({
  fetchText: fetchCalendarText,
  getCalendars: () => calendarsFromEnv(process.env),
});

async function fetchNewsContent(source, expectJson) {
  const initialUrl = new URL(source.url);
  if (initialUrl.protocol !== "https:" || initialUrl.username || initialUrl.password) {
    throw new Error("News source URL is not approved.");
  }
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: {
        accept: expectJson
          ? "application/json"
          : "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "user-agent": "NorthstarHomeDashboard/0.1",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) throw new Error("News source returned an invalid redirect.");
      const redirectUrl = new URL(location, currentUrl);
      await response.body?.cancel();
      if (redirectUrl.origin !== initialUrl.origin || redirectUrl.username || redirectUrl.password) {
        throw new Error("News source redirected outside its approved host.");
      }
      currentUrl = redirectUrl;
      continue;
    }
    if (!response.ok) throw new Error(`News source returned ${response.status}.`);

    const contentType = response.headers.get("content-type") ?? "";
    if (!isAllowedFeedContentType(contentType, expectJson)) {
      throw new Error("News source returned an unsupported content type.");
    }

    const body = await readLimitedBody(response, 512 * 1024);
    if (!expectJson) return body;
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("News source returned invalid JSON.");
    }
  }
  throw new Error("News source exceeded the redirect limit.");
}

const newsService = createNewsService({
  fetchXml: (source) => fetchNewsContent(source, false),
  fetchJson: (source) => fetchNewsContent(source, true),
  onSourceError: (source, error) => console.error("News source failed:", source.id, error.name),
});

// GitHub Contents API for the configured task file. The token is only sent to api.github.com
// and never logged or returned.
async function githubTasksRequest(method, body) {
  const config = tasksConfigFromEnv(process.env);
  if (!config) requireConfig(["GITHUB_TASKS_TOKEN", "GITHUB_TASKS_REPO"]);
  const path = config.path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.github.com/repos/${config.repo}/contents/${path}`, {
    method,
    signal: AbortSignal.timeout(12000),
    redirect: "error",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "NorthstarHomeDashboard/0.1",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await readLimitedBody(response, 1024 * 1024);
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

const tasksService = createTasksService({ github: githubTasksRequest });

// intervals.icu with the personal API key (basic auth, username "API_KEY"). The key is
// only sent to intervals.icu and never logged or returned.
const healthService = createHealthService({
  getJson: (path) => {
    const config = healthConfigFromEnv(process.env);
    return fetchJson(`${INTERVALS_API}${path}`, {
      redirect: "error",
      headers: { authorization: `Basic ${Buffer.from(`API_KEY:${config.apiKey}`).toString("base64")}` },
    });
  },
});

function requireConfig(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    const error = new Error("Deze koppeling is niet geconfigureerd op de server.");
    error.status = 503;
    error.code = "not_configured";
    throw error;
  }
}

async function getHomeAssistant() {
  requireConfig(["HOME_ASSISTANT_URL", "HOME_ASSISTANT_TOKEN"]);
  const baseUrl = process.env.HOME_ASSISTANT_URL.replace(/\/+$/, "");
  const url = new URL("/api/states", baseUrl);
  const entities = await fetchJson(url, {
    headers: { authorization: `Bearer ${process.env.HOME_ASSISTANT_TOKEN}` },
  });
  if (!Array.isArray(entities)) throw new Error("Home Assistant returned an unexpected response.");

  const devices = entities
    .filter((entity) => entity.entity_id && !entity.entity_id.startsWith("sensor."))
    .slice(0, 12)
    .map((entity) => ({
      name: entity.attributes?.friendly_name ?? entity.entity_id,
      state: entity.state ?? "unknown",
      domain: entity.entity_id.split(".")[0],
    }));
  const temperature = entities.find((entity) =>
    entity.entity_id?.startsWith("sensor.") &&
    /temperature/i.test(entity.attributes?.device_class ?? ""),
  );
  const vacuum = entities.find((entity) => entity.entity_id?.startsWith("vacuum."));
  return {
    configured: true,
    devices,
    temperature: temperature
      ? {
          name: temperature.attributes?.friendly_name ?? "Temperature",
          value: String(temperature.state),
          unit: temperature.attributes?.unit_of_measurement ?? "°",
        }
      : null,
    vacuum: vacuum
      ? {
          name: vacuum.attributes?.friendly_name ?? "Robot vacuum",
          state: String(vacuum.state),
        }
      : null,
  };
}

const apiRouteCache = new Map();
const apiRouteInFlight = new Map();
const sharedApiRouteTtl = new Map([
  ["/api/weather", 15 * 60 * 1000],
  ["/api/finance", 60 * 60 * 1000],
  ["/api/home-assistant", 5 * 60 * 1000],
  ["/api/projects", 30 * 60 * 1000],
  ["/api/sports/nba", 60 * 1000],
  ["/api/sports/nba/players", 5 * 60 * 1000],
  ["/api/sports/premier-league", 60 * 1000],
  ["/api/sports/belgian-football", 5 * 60 * 1000],
]);
const imieHistoryService = createImieHistoryService({
  fetchJson,
  fetchBuffer,
  isTradingTime: isXetraTradingTime,
});
const sportsService = createSportsService({
  fetchJson,
  loadExtraNews: (sourceId) => newsService.loadSource(sourceId),
});
const economicsService = createEconomicsService({
  loaders: createEconomicLoaders({ fetchJson, fetchText }),
});

async function routeApi(url) {
  if (url.pathname === "/api/briefing" || url.pathname === "/api/news" || url.pathname.startsWith("/api/sport/")) {
    return routeApiUncached(url);
  }
  const ttlMs = sharedApiRouteTtl.get(url.pathname);
  if (!ttlMs) return routeApiUncached(url);

  const refresh = url.searchParams.get("refresh") === "1";
  const currentTime = Date.now();
  const cached = apiRouteCache.get(url.pathname);
  if (!refresh && cached && cached.expiresAt > currentTime) return cached.value;

  const existing = apiRouteInFlight.get(url.pathname);
  if (existing) return existing;

  let request;
  request = (async () => {
    try {
      const value = await routeApiUncached(url);
      apiRouteCache.set(url.pathname, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (error) {
      if (refresh) apiRouteCache.delete(url.pathname);
      throw error;
    } finally {
      if (apiRouteInFlight.get(url.pathname) === request) {
        apiRouteInFlight.delete(url.pathname);
      }
    }
  })();
  apiRouteInFlight.set(url.pathname, request);
  return request;
}

async function routeApiUncached(url) {
  const sportRoute = url.pathname.match(/^\/api\/sport\/([a-z-]+)(\/overview)?$/);
  if (sportRoute) {
    if (url.searchParams.has("refresh") && url.searchParams.get("refresh") !== "1") {
      const error = new Error("Unknown sport refresh option.");
      error.status = 400;
      throw error;
    }
    const options = { refresh: url.searchParams.get("refresh") === "1" };
    return sportRoute[2]
      ? sportsService.overview(sportRoute[1], options)
      : sportsService.detail(sportRoute[1], options);
  }

  if (url.pathname === "/api/economy/imie-history") {
    return imieHistoryService.get(url.searchParams.get("range") ?? "1m");
  }

  if (url.pathname === "/api/economy") {
    if (url.searchParams.has("refresh") && url.searchParams.get("refresh") !== "1") {
      const error = new Error("Unknown economy refresh option.");
      error.status = 400;
      throw error;
    }
    return economicsService.get({ refresh: url.searchParams.get("refresh") === "1" });
  }

  if (url.pathname === "/api/briefing") {
    if (url.searchParams.has("refresh") && url.searchParams.get("refresh") !== "1") {
      const error = new Error("Unknown briefing refresh option.");
      error.status = 400;
      throw error;
    }
    const refresh = url.searchParams.get("refresh") === "1";
    if (refresh) newsService.clearCache();
    return dailyBriefingService.get({ refresh });
  }

  if (url.pathname === "/api/weather") {
    const latitude = Number(process.env.WEATHER_LAT || 50.9894);
    const longitude = Number(process.env.WEATHER_LON || 5.0506);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      const error = new Error("De weerlocatie is niet correct geconfigureerd.");
      error.status = 500;
      throw error;
    }
    const location = process.env.WEATHER_LOCATION || "Diest";
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: WEATHER_CURRENT,
      hourly: WEATHER_HOURLY,
      daily: WEATHER_DAILY,
      forecast_days: "7",
      timezone: "auto",
    });
    return mapForecast(await fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`), location);
  }

  if (url.pathname === "/api/news") {
    const categoryAliases = {
      world: "international",
      technology: "technology-ai",
      business: "economy-business",
    };
    const requestedCategory = url.searchParams.get("category") ?? "world";
    const category = categoryAliases[requestedCategory] ?? requestedCategory;
    const isLegacyRequest =
      !url.searchParams.has("view") &&
      (url.searchParams.size === 0 ||
        (Object.hasOwn(categoryAliases, requestedCategory) && url.searchParams.size === 1));
    const result = await newsService.query({
      view: url.searchParams.get("view") ?? undefined,
      category,
      sourceId: url.searchParams.get("source") ?? undefined,
      since: url.searchParams.get("since") ?? (isLegacyRequest ? "all" : "7d"),
      sort: url.searchParams.get("sort") ?? "relevant",
      limit: url.searchParams.has("limit")
        ? url.searchParams.get("limit")
        : isLegacyRequest
          ? 8
          : undefined,
    });
    return isLegacyRequest ? result.articles.slice(0, 8) : result;
  }

  if (url.pathname === "/api/sports/nba") {
    return loadNbaData(fetchJson, async () => {
      const result = await newsService.loadSource("espn-nba-news");
      return {
        articles: result.articles,
        warnings: result.warnings.map((warning) => warning.message),
      };
    });
  }

  if (url.pathname === "/api/sports/nba/players") return loadNbaPlayers(fetchJson);

  if (url.pathname === "/api/sports/premier-league") {
    const [scoreboardResult, newsResult] = await Promise.allSettled([
      fetchJson("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?limit=30"),
      newsService.loadSource("bbc-premier-league"),
    ]);
    if (scoreboardResult.status === "rejected") throw scoreboardResult.reason;
    const warnings = newsResult.status === "fulfilled" && newsResult.value.warnings.length
      ? newsResult.value.warnings.map((warning) => warning.message)
      : newsResult.status === "rejected"
        ? ["Premier League headlines are temporarily unavailable."]
        : [];
    return {
      events: mapSportsEvents(scoreboardResult.value),
      news: newsResult.status === "fulfilled" ? newsResult.value.articles.slice(0, 5) : [],
      warnings,
    };
  }

  if (url.pathname === "/api/sports/belgian-football") {
    const result = await newsService.loadSource("sporza-belgian-football");
    return {
      events: [],
      news: result.articles.slice(0, 2),
      warnings: result.warnings.map((warning) => warning.message),
    };
  }

  if (url.pathname === "/api/health") {
    const config = healthConfigFromEnv(process.env);
    if (!config) requireConfig(["INTERVALS_ATHLETE_ID", "INTERVALS_API_KEY"]);
    return healthService.get({ athleteId: config.athleteId, refresh: url.searchParams.get("refresh") === "1" });
  }

  if (url.pathname === "/api/tasks") {
    if (!tasksConfigFromEnv(process.env)) requireConfig(["GITHUB_TASKS_TOKEN", "GITHUB_TASKS_REPO"]);
    return tasksService.get({ refresh: url.searchParams.get("refresh") === "1" });
  }

  if (url.pathname === "/api/calendar") {
    if (!isCalendarConfigured(process.env)) requireConfig(["CALENDAR_ICS_URLS"]);
    return calendarService.get({ refresh: url.searchParams.get("refresh") === "1" });
  }

  if (url.pathname === "/api/finance") {
    const payload = await fetchJson("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP,CHF");
    return payload;
  }

  if (url.pathname === "/api/home-assistant") return getHomeAssistant();

  if (url.pathname === "/api/projects") {
    if (!process.env.PROJECTS_JSON) return [];
    let projects;
    try {
      projects = JSON.parse(process.env.PROJECTS_JSON);
    } catch {
      const error = new Error("PROJECTS_JSON must contain a valid JSON array.");
      error.status = 500;
      throw error;
    }
    const validProjects = Array.isArray(projects) && projects.every((project) => {
      if (
        typeof project.name !== "string" ||
        typeof project.url !== "string" ||
        (project.description !== undefined && typeof project.description !== "string")
      ) return false;
      try {
        return ["http:", "https:"].includes(new URL(project.url).protocol);
      } catch {
        return false;
      }
    });
    if (!validProjects) {
      const error = new Error("PROJECTS_JSON must be an array of projects with valid http(s) links.");
      error.status = 500;
      throw error;
    }
    return projects;
  }

  return null;
}

async function loadDailyBriefingInputs({ refresh = false } = {}) {
  const jobs = [
    { key: "economics", source: "Economische indicatoren", path: "/api/economy" },
    { key: "weather", source: "Weer · Open-Meteo", path: "/api/weather" },
    { key: "finance", source: "Referentiekoersen · Frankfurter", path: "/api/finance" },
    { key: "nba", source: "NBA · ESPN", path: "/api/sports/nba" },
    { key: "nbaPlayers", source: "NBA-selecties · ESPN", path: "/api/sports/nba/players" },
    { key: "premierLeague", source: "Premier League · ESPN en BBC Sport", path: "/api/sports/premier-league" },
    { key: "belgianFootball", source: "Belgisch voetbal · Sporza", path: "/api/sports/belgian-football" },
    ...["belgium", "international", "technology-ai", "economy-business", "sport"].map((category) => ({
      key: category,
      source: `Nieuws · ${category}`,
      path: `/api/news?category=${category}&since=7d&sort=relevant&limit=20`,
    })),
  ];
  if (isCalendarConfigured(process.env)) {
    jobs.push({ key: "agenda", source: "Agenda · ICS", path: "/api/calendar" });
  }

  const results = await Promise.allSettled(jobs.map(({ path }) => {
    const requestPath = refresh
      ? `${path}${path.includes("?") ? "&" : "?"}refresh=1`
      : path;
    return routeApi(new URL(requestPath, "http://localhost"));
  }));
  const inputs = {
    newsByCategory: {},
    agendaConfigured: isCalendarConfigured(process.env),
    warnings: [],
  };
  results.forEach((result, index) => {
    const job = jobs[index];
    if (result.status === "fulfilled") {
      if (["belgium", "international", "technology-ai", "economy-business", "sport"].includes(job.key)) {
        inputs.newsByCategory[job.key] = result.value;
      } else {
        inputs[job.key] = result.value;
      }
      return;
    }
    inputs.warnings.push({
      source: job.source,
      message: result.reason instanceof Error
        ? result.reason.message
        : "Data is temporarily unavailable.",
      stale: false,
    });
  });
  return inputs;
}

const dailyBriefingService = createDailyBriefingService({
  loadInputs: loadDailyBriefingInputs,
});

async function serveStatic(pathname, response) {
  const dist = resolve(root, "dist");
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const candidate = resolve(dist, `.${decodedPath}`);
  if (candidate !== dist && !candidate.startsWith(`${dist}${sep}`)) {
    response.writeHead(400).end("Bad request");
    return;
  }
  let file = candidate;
  try {
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
  } catch {
    file = resolve(dist, "index.html");
  }
  try {
    const content = await readFile(file);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    };
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const MAX_WRITE_BODY_BYTES = 2048;

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error("Verzoek is te groot.");
        error.status = 413;
        request.destroy();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendApiError(response, pathname, error) {
  const status = error.status ?? 502;
  if (error.code === "not_configured") {
    return sendJson(response, status, { error: error.message, code: "not_configured" });
  }
  if (status >= 500) {
    console.error("API request failed:", pathname, error.name);
    return sendJson(response, status, { error: "Live gegevens zijn tijdelijk niet beschikbaar." });
  }
  return sendJson(response, status, { error: error.message || "Invalid request." });
}

// The only state-changing API route. Requires, in this order: POST, a configured
// server, rate limit, same Origin as AUTH_URL, JSON content type, a small body, a valid
// allow-listed session and Auth.js's double-submit CSRF token.
async function handleTaskToggle(request, response, url) {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!authConfig) {
    return sendJson(response, 503, { error: "Aanmelden is niet geconfigureerd op deze server." });
  }
  if (isRateLimited(request, "write", 30, 60_000)) {
    return sendRateLimitResponse(response);
  }
  if (!isAllowedOrigin(request.headers.origin, process.env.AUTH_URL)) {
    return sendJson(response, 403, { error: "Verzoek geweigerd." });
  }
  if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return sendJson(response, 415, { error: "Verwacht JSON." });
  }
  if (Number(request.headers["content-length"] ?? 0) > MAX_WRITE_BODY_BYTES) {
    return sendJson(response, 413, { error: "Verzoek is te groot." });
  }

  let user;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    console.error("Session validation failed:", error.name);
    return sendJson(response, 503, { error: "Authenticatie is tijdelijk niet beschikbaar." });
  }
  if (!user) return sendJson(response, 401, { error: "Aanmelden vereist." });

  let body;
  try {
    body = JSON.parse(await readRequestBody(request, MAX_WRITE_BODY_BYTES));
  } catch (error) {
    return sendJson(response, error.status ?? 400, { error: error.status === 413 ? "Verzoek is te groot." : "Ongeldige JSON." });
  }
  if (!verifyCsrfToken({ cookieHeader: request.headers.cookie, cookieName: csrfCookieName, secret: process.env.AUTH_SECRET, bodyToken: body?.csrfToken })) {
    return sendJson(response, 403, { error: "Verzoek geweigerd." });
  }
  if (typeof body.id !== "string" || !/^[a-f0-9]{16}$/.test(body.id) || typeof body.done !== "boolean") {
    return sendJson(response, 400, { error: "Ongeldige taak." });
  }

  try {
    if (!tasksConfigFromEnv(process.env)) requireConfig(["GITHUB_TASKS_TOKEN", "GITHUB_TASKS_REPO"]);
    return sendJson(response, 200, await tasksService.toggle({ id: body.id, done: body.done }));
  } catch (error) {
    return sendApiError(response, url.pathname, error);
  }
}

async function handleRequest(request, response) {
  applySecurityHeaders(response);
  let url;
  try {
    url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  } catch {
    return sendJson(response, 400, { error: "Invalid request URL." });
  }

  if (url.pathname === "/healthz") {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      return sendJson(response, 405, { error: "Method not allowed." });
    }
    return sendJson(response, authConfig ? 200 : 503, { status: authConfig ? "ok" : "not_ready" });
  }

  if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
    return handleAuthRequest(request, response, url);
  }

  if (url.pathname === "/api/tasks/toggle") {
    return handleTaskToggle(request, response, url);
  }

  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      return sendJson(response, 405, { error: "Method not allowed." });
    }
    if (!authConfig) {
      return sendJson(response, 503, { error: "Aanmelden is niet geconfigureerd op deze server." });
    }
    if (isRateLimited(request, "api", 120, 60_000)) {
      return sendRateLimitResponse(response);
    }

    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      console.error("Session validation failed:", error.name);
      return sendJson(response, 503, { error: "Authenticatie is tijdelijk niet beschikbaar." });
    }
    if (!user) return sendJson(response, 401, { error: "Aanmelden vereist." });

    try {
      const result = await routeApi(url);
      if (result === null) return sendJson(response, 404, { error: "API route not found." });
      return sendJson(response, 200, result);
    } catch (error) {
      return sendApiError(response, url.pathname, error);
    }
  }

  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  await serveStatic(url.pathname, response);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    console.error("Request handler failed:", error.name);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Internal server error." });
    } else {
      response.destroy();
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Dashboard API server listening on http://localhost:${port}`);
});
