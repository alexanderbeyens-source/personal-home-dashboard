import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { Auth } from "@auth/core";
import GitHub from "@auth/core/providers/github";

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
  response.end(JSON.stringify({ error: "Too many requests. Try again shortly." }));
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
    return sendJson(response, 503, { error: "Sign-in is not configured on this server." });
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
    sendJson(response, 500, { error: "Authentication is temporarily unavailable." });
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

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/<[^>]*>/g, "")
    .trim();
}

function parseRss(xml, limit = 8) {
  const items = [...xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, limit);
  return items.map(([item]) => {
    const readTag = (tag) => {
      const match = item.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return match ? decodeXml(match[1]) : "";
    };
    const linkTag = item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const atomLink = item.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    const date = readTag("pubDate") || readTag("published") || readTag("updated");
    const source = readTag("source") || "Live feed";
    return {
      title: readTag("title"),
      link: decodeXml(linkTag?.[1] || atomLink?.[1] || ""),
      source,
      publishedAt: date ? new Date(date).toISOString() : null,
    };
  }).filter((item) => item.title && item.link);
}

function mapSportsEvents(payload) {
  return (payload.events ?? []).map((event) => {
    const competition = event.competitions?.[0];
    return {
      id: event.id,
      name: event.name,
      date: event.date,
      status: event.status?.type?.description ?? "Scheduled",
      shortStatus: event.status?.type?.shortDetail ?? event.status?.type?.detail ?? "Upcoming",
      competitors: (competition?.competitors ?? []).map((competitor) => ({
        name: competitor.team?.displayName ?? competitor.team?.name ?? "Team",
        abbreviation: competitor.team?.abbreviation ?? "—",
        score: competitor.score ?? "",
        homeAway: competitor.homeAway ?? "",
        logo: competitor.team?.logo ?? null,
        winner: Boolean(competitor.winner),
      })),
    };
  });
}

function parseCalendar(ics) {
  const events = [...ics.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)]
    .map(([_, block]) => {
      const fields = {};
      for (const line of block.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
        const match = line.match(/^([A-Z-]+)((?:;[^:]+)*):([\s\S]*)$/);
        if (!match) continue;
        const [, key, parameters, value] = match;
        fields[key] = { value, timezone: parameters.match(/;TZID=([^;]+)/)?.[1] ?? null };
      }
      const start = fields.DTSTART;
      if (!start) return null;
      const parsed = parseCalendarDate(start.value, start.timezone);
      return {
        title: (fields.SUMMARY?.value || "Calendar event").replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " "),
        start: parsed.toISOString(),
        location: fields.LOCATION?.value.replace(/\\([,;\\])/g, "$1") || null,
      };
    })
    .filter((event) => event && new Date(event.start).getTime() >= Date.now() - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 8);
  return { events };
}

function parseCalendarDate(value, timezone) {
  if (/^\d{8}$/.test(value)) {
    return new Date(Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8)));
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) throw new Error("Calendar contains an unsupported event date.");
  const [, year, month, day, hour, minute, second, utc] = match;
  const localParts = [+year, +month - 1, +day, +hour, +minute, +second];
  if (utc || !timezone) return new Date(Date.UTC(...localParts));
  let timestamp = Date.UTC(...localParts);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, Number(part.value)]),
    );
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    timestamp += Date.UTC(...localParts) - representedAsUtc;
  }
  return new Date(timestamp);
}

function requireConfig(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    const error = new Error(`Not configured. Set ${missing.join(" and ")} in your local .env file.`);
    error.status = 503;
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

async function routeApi(url) {
  if (url.pathname === "/api/weather") {
    const latitude = Number(process.env.WEATHER_LAT || 50.8503);
    const longitude = Number(process.env.WEATHER_LON || 4.3517);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      const error = new Error("Weather location is not configured correctly.");
      error.status = 500;
      throw error;
    }
    const location = process.env.WEATHER_LOCATION || "Brussels";
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
      timezone: "auto",
    });
    const payload = await fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`);
    return {
      location,
      temperature: payload.current.temperature_2m,
      apparentTemperature: payload.current.apparent_temperature,
      humidity: payload.current.relative_humidity_2m,
      windSpeed: payload.current.wind_speed_10m,
      weatherCode: payload.current.weather_code,
      isDay: Boolean(payload.current.is_day),
    };
  }

  if (url.pathname === "/api/news") {
    const feeds = {
      world: "https://feeds.bbci.co.uk/news/rss.xml",
      technology: "https://feeds.bbci.co.uk/news/technology/rss.xml",
      business: "https://feeds.bbci.co.uk/news/business/rss.xml",
    };
    const category = url.searchParams.get("category") ?? "world";
    if (!feeds[category]) {
      const error = new Error("Unknown news category.");
      error.status = 400;
      throw error;
    }
    return parseRss(await fetchText(feeds[category]));
  }

  if (url.pathname === "/api/sports/nba") {
    const [scoreboard, news, portlandRoster, oklahomaRoster] = await Promise.all([
      fetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=30"),
      fetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=10"),
      fetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/por/roster"),
      fetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/okc/roster"),
    ]);
    const rosterPlayers = [
      {
        athlete: portlandRoster.athletes?.find((player) => /toumani camara/i.test(player.fullName ?? "")),
        name: "Toumani Camara",
        team: portlandRoster.team?.displayName,
      },
      {
        athlete: oklahomaRoster.athletes?.find((player) => /ajay mitchell/i.test(player.fullName ?? "")),
        name: "AJ Mitchell",
        team: oklahomaRoster.team?.displayName,
      },
    ];
    const featuredPlayers = rosterPlayers.map(({ athlete, name, team }) => {
      const profile = athlete?.links?.find((link) => link.rel?.includes("playercard"))?.href;
      if (!athlete || !profile || !team) throw new Error(`ESPN roster data did not include a profile for ${name}.`);
      return {
        name,
        team,
        url: profile,
      };
    });
    return {
      events: mapSportsEvents(scoreboard),
      featuredPlayers,
      news: (news.articles ?? []).slice(0, 8).map((article) => ({
        title: article.headline ?? article.title ?? "",
        link: article.links?.web?.href ?? article.links?.api?.news?.href ?? "",
        source: "ESPN",
        publishedAt: article.published ?? null,
      })).filter((article) => article.title && article.link),
    };
  }

  if (url.pathname === "/api/sports/premier-league") {
    const [scoreboard, newsFeed] = await Promise.all([
      fetchJson("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?limit=30"),
      fetchText("https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml"),
    ]);
    return { events: mapSportsEvents(scoreboard), news: parseRss(newsFeed, 5) };
  }

  if (url.pathname === "/api/calendar") {
    requireConfig(["CALENDAR_ICS_URL"]);
    return parseCalendar(await fetchText(process.env.CALENDAR_ICS_URL));
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

  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      return sendJson(response, 405, { error: "Method not allowed." });
    }
    if (!authConfig) {
      return sendJson(response, 503, { error: "Sign-in is not configured on this server." });
    }
    if (isRateLimited(request, "api", 120, 60_000)) {
      return sendRateLimitResponse(response);
    }

    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      console.error("Session validation failed:", error.name);
      return sendJson(response, 503, { error: "Authentication is temporarily unavailable." });
    }
    if (!user) return sendJson(response, 401, { error: "Sign-in required." });

    try {
      const result = await routeApi(url);
      if (result === null) return sendJson(response, 404, { error: "API route not found." });
      return sendJson(response, 200, result);
    } catch (error) {
      const status = error.status ?? 502;
      if (status >= 500) {
        console.error("API request failed:", url.pathname, error.name);
        return sendJson(response, status, { error: "Live data is temporarily unavailable." });
      }
      return sendJson(response, status, { error: error.message || "Invalid request." });
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
