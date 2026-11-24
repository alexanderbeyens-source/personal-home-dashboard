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
  const port = await reservePort();
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
    stdio: "ignore",
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
      HOME_ASSISTANT_TOKEN: "",
    });
    child = server.child;
    const sessionToken = await encode({
      token: { githubUserId: allowedGithubId },
      secret: authSecret,
      salt: sessionCookieName,
    });
    const headers = { cookie: `${sessionCookieName}=${sessionToken}` };

    for (const route of ["/api/calendar", "/api/home-assistant", "/api/tasks", "/api/health"]) {
      const response = await fetch(`${server.baseUrl}${route}`, { headers });
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toEqual({
        error: "Deze koppeling is niet geconfigureerd op de server.",
        code: "not_configured",
      });
      expect(JSON.stringify(body)).not.toMatch(/CALENDAR_ICS_URL|HOME_ASSISTANT|GITHUB_TASKS|INTERVALS/);
    }

    const unknown = await fetch(`${server.baseUrl}/api/unknown-route`, { headers });
    expect(unknown.status).toBe(404);
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
  });
});
