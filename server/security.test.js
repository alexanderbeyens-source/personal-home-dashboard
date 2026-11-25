import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { encode } from "@auth/core/jwt";
import { afterEach, describe, expect, it } from "vitest";

const authSecret = "a-dummy-test-secret-that-is-long-enough";
const allowedGithubId = "123456";
const sessionCookieName = "northstar.session-token";

async function reservePort() {
  const portServer = createServer();
  await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
  const address = portServer.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local test port.");
  const { port } = address;
  await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(extraEnv = {}) {
  return startServerOnPort(await reservePort(), extraEnv);
}

async function startServerOnPort(port, extraEnv = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      AUTH_URL: `http://127.0.0.1:${port}`,
      AUTH_SECRET: authSecret,
      AUTH_GITHUB_ID: "test-client-id",
      AUTH_GITHUB_SECRET: "test-client-secret",
      ALLOWED_GITHUB_ID: allowedGithubId,
      ...extraEnv,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.logs = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    child.logs += chunk;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Backend exited before becoming ready.");
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      ready = response.status === 200;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  expect(ready).toBe(true);
  return { child, baseUrl };
}

describe("protected API routes", () => {
  let child;

  afterEach(async () => {
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await once(child, "exit");
  });

  it("keeps live data routes behind GitHub session authentication", async () => {
    const server = await startServer();
    child = server.child;
    const { baseUrl } = server;

    for (const route of [
      "/api/weather",
      "/api/economy",
      "/api/briefing",
      "/api/sports/nba/players",
      "/api/sports/belgian-football",
      "/api/news?view=briefing",
      "/api/vehicle",
      "/api/smartcar/connect",
      "/api/smartcar/callback?state=x&user_id=y",
    ]) {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Aanmelden vereist." });
    }

    const page = await fetch(baseUrl);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");

    const newsPage = await fetch(`${baseUrl}/news`);
    expect(newsPage.status).toBe(200);
    expect(newsPage.headers.get("content-type")).toContain("text/html");
  });

  it("reports unconfigured integrations explicitly without exposing variable names", async () => {
    const server = await startServer({
      CALENDAR_ICS_URL: "",
      GITHUB_TASKS_TOKEN: "",
      GITHUB_TASKS_REPO: "",
      CALENDAR_ICS_URLS: "",
      HOME_ASSISTANT_URL: "",
      INTERVALS_ATHLETE_ID: "",
      INTERVALS_API_KEY: "",
      DUOLINGO_USERNAME: "",
      SMARTCAR_CLIENT_ID: "",
      SMARTCAR_CLIENT_SECRET: "",
      SMARTCAR_REDIRECT_URI: "",
      SMARTCAR_APPLICATION_ID: "",
      HOME_ASSISTANT_TOKEN: "",
    });
    child = server.child;
    const sessionToken = await encode({
      token: { githubUserId: allowedGithubId },
      secret: authSecret,
      salt: sessionCookieName,
    });
    const headers = { cookie: `${sessionCookieName}=${sessionToken}` };

    for (const route of ["/api/calendar", "/api/home-assistant", "/api/tasks", "/api/health", "/api/duolingo", "/api/vehicle"]) {
      const response = await fetch(`${server.baseUrl}${route}`, { headers });
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toEqual({
        error: "Deze koppeling is niet geconfigureerd op de server.",
        code: "not_configured",
      });
      expect(JSON.stringify(body)).not.toMatch(/CALENDAR_ICS_URL|HOME_ASSISTANT|GITHUB_TASKS|INTERVALS|DUOLINGO|SMARTCAR/);
    }

    const unknown = await fetch(`${server.baseUrl}/api/unknown-route`, { headers });
    expect(unknown.status).toBe(404);

    // Without Smartcar settings the Connect button leads back to the dashboard, not to Smartcar.
    const connect = await fetch(`${server.baseUrl}/api/smartcar/connect`, { headers, redirect: "manual" });
    expect(connect.status).toBe(302);
    expect(connect.headers.get("location")).toBe("/?auto=config");
  });

  it("starts Smartcar Connect only for the signed-in owner and checks the callback state", async () => {
    // The redirect URI must point at this server's own callback (same origin as AUTH_URL).
    const port = await reservePort();
    const server = await startServerOnPort(port, {
      SMARTCAR_CLIENT_ID: "8229df9f-91a0-4ff0-a1ae-a1f38ee24d07",
      SMARTCAR_CLIENT_SECRET: "dummy-smartcar-secret-value",
      SMARTCAR_REDIRECT_URI: `http://127.0.0.1:${port}/api/smartcar/callback`,
    });
    child = server.child;
    const sessionToken = await encode({
      token: { githubUserId: allowedGithubId },
      secret: authSecret,
      salt: sessionCookieName,
    });
    const headers = { cookie: `${sessionCookieName}=${sessionToken}` };

    const connect = await fetch(`${server.baseUrl}/api/smartcar/connect`, { headers, redirect: "manual" });
    expect(connect.status).toBe(302);
    const location = new URL(connect.headers.get("location"));
    expect(location.origin).toBe("https://connect.smartcar.com");
    expect(location.searchParams.get("response_type")).toBe("none");
    expect(location.href).not.toContain("dummy-smartcar-secret-value");
    const state = location.searchParams.get("state");

    const forged = await fetch(`${server.baseUrl}/api/smartcar/callback?state=forged&user_id=u`, { headers, redirect: "manual" });
    expect(forged.headers.get("location")).toBe("/?auto=ongeldig");

    const callback = await fetch(`${server.baseUrl}/api/smartcar/callback?state=${encodeURIComponent(state)}&user_id=u`, { headers, redirect: "manual" });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/?auto=gekoppeld");

    const replay = await fetch(`${server.baseUrl}/api/smartcar/callback?state=${encodeURIComponent(state)}&user_id=u`, { headers, redirect: "manual" });
    expect(replay.headers.get("location")).toBe("/?auto=ongeldig");

    const post = await fetch(`${server.baseUrl}/api/smartcar/connect`, { method: "POST", headers });
    expect(post.status).toBe(405);
    expect(child.logs).not.toContain("dummy-smartcar-secret-value");
  });

  it("protects the task write route with origin, session, CSRF token and size checks", async () => {
    const server = await startServer({ GITHUB_TASKS_TOKEN: "", GITHUB_TASKS_REPO: "" });
    child = server.child;
    const { baseUrl } = server;
    const sessionToken = await encode({
      token: { githubUserId: allowedGithubId },
      secret: authSecret,
      salt: sessionCookieName,
    });
    const csrfToken = "c".repeat(64);
    const csrfCookie = `authjs.csrf-token=${encodeURIComponent(`${csrfToken}|${createHash("sha256").update(`${csrfToken}${authSecret}`).digest("hex")}`)}`;
    const session = `${sessionCookieName}=${sessionToken}`;
    const valid = { id: "0123456789abcdef", done: true, csrfToken };
    const post = (body, headers = {}) => fetch(`${baseUrl}/api/tasks/toggle`, {
      method: "POST",
      headers: { origin: baseUrl, "content-type": "application/json", cookie: `${session}; ${csrfCookie}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

    expect((await fetch(`${baseUrl}/api/tasks/toggle`)).status).toBe(405);
    expect((await fetch(`${baseUrl}/api/tasks`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${baseUrl}/api/tasks`)).status).toBe(401);

    expect((await post(valid, { cookie: csrfCookie })).status).toBe(401);
    expect((await post(valid, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(valid, { origin: "" })).status).toBe(403);
    expect((await post({ ...valid, csrfToken: "d".repeat(64) })).status).toBe(403);
    expect((await post(valid, { cookie: session })).status).toBe(403);
    expect((await post(valid, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post({ ...valid, padding: "x".repeat(3000) })).status).toBe(413);
    expect((await post({ ...valid, id: "../../etc" })).status).toBe(400);

    const accepted = await post(valid);
    expect(accepted.status).toBe(503);
    expect(await accepted.json()).toEqual({ error: "Deze koppeling is niet geconfigureerd op de server.", code: "not_configured" });

    const newTask = { section: "once", text: "Tandarts bellen", due: "2026-12-01", csrfToken };
    const add = (body, headers = {}) => fetch(`${baseUrl}/api/tasks/add`, {
      method: "POST",
      headers: { origin: baseUrl, "content-type": "application/json", cookie: `${session}; ${csrfCookie}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    expect((await fetch(`${baseUrl}/api/tasks/add`)).status).toBe(405);
    expect((await add(newTask, { cookie: csrfCookie })).status).toBe(401);
    expect((await add(newTask, { origin: "https://evil.example" })).status).toBe(403);
    expect((await add({ ...newTask, csrfToken: "d".repeat(64) })).status).toBe(403);
    expect((await add(newTask, { cookie: session })).status).toBe(403);
    expect((await add("null")).status).toBe(403);
    expect((await add(newTask, { "content-type": "text/plain" })).status).toBe(415);
    expect((await add({ ...newTask, text: "x".repeat(3000) })).status).toBe(413);
    const invalid = await add({ ...newTask, section: "notes" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Kies een geldige rubriek." });

    const added = await add(newTask);
    expect(added.status).toBe(503);
    expect(await added.json()).toEqual({ error: "Deze koppeling is niet geconfigureerd op de server.", code: "not_configured" });
  });

  it("logs why a calendar failed without logging its secret link", async () => {
    const closedPort = await reservePort();
    const secretPath = "published/2/SECRET-CALENDAR-TOKEN-7f3a9c";
    const server = await startServer({
      CALENDAR_ICS_URL: "",
      CALENDAR_ICS_URLS: JSON.stringify([{ name: "Gezin", url: `webcal://127.0.0.1:${closedPort}/${secretPath}` }]),
    });
    child = server.child;
    const sessionToken = await encode({
      token: { githubUserId: allowedGithubId },
      secret: authSecret,
      salt: sessionCookieName,
    });
    const response = await fetch(`${server.baseUrl}/api/calendar`, { headers: { cookie: `${sessionCookieName}=${sessionToken}` } });
    expect(response.status).toBe(502);
    const body = await response.text();
    for (let attempt = 0; attempt < 20 && !child.logs.includes("API request failed"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(child.logs).toContain("Calendar failed: cal-1 kind=network code=ECONNREFUSED");
    expect(child.logs).toContain("API request failed: /api/calendar");
    for (const text of [child.logs, body]) {
      expect(text).not.toContain("SECRET-CALENDAR-TOKEN");
      expect(text).not.toContain(String(closedPort));
      expect(text).not.toContain("CALENDAR_ICS");
    }
  });

  it("explains an invalid calendar configuration without exposing the configured links", async () => {
    const server = await startServer({
      CALENDAR_ICS_URL: "",
      CALENDAR_ICS_URLS: "[{\u201Cname\u201D:\u201CGezin\u201D,\u201Curl\u201D:\u201Cwebcal://p01-caldav.icloud.com/published/2/SECRET-CONFIG-TOKEN-91b\u201D}]",
    });
    child = server.child;
    const sessionToken = await encode({
      token: { githubUserId: allowedGithubId },
      secret: authSecret,
      salt: sessionCookieName,
    });
    const response = await fetch(`${server.baseUrl}/api/calendar`, { headers: { cookie: `${sessionCookieName}=${sessionToken}` } });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("invalid_config");
    expect(body.error).toMatch(/gekrulde aanhalingstekens/);
    for (let attempt = 0; attempt < 20 && !child.logs.includes("API request failed"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(child.logs).toContain("API request failed: /api/calendar kind=config reason=smart-quotes");
    for (const text of [child.logs, JSON.stringify(body)]) {
      expect(text).not.toContain("SECRET-CONFIG-TOKEN");
      expect(text).not.toContain("icloud");
      expect(text).not.toContain("CALENDAR_ICS");
    }
  });
});
