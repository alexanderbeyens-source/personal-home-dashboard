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

    for (const route of ["/api/calendar", "/api/home-assistant", "/api/health"]) {
      const response = await fetch(`${server.baseUrl}${route}`, { headers });
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toEqual({
        error: "Deze koppeling is niet geconfigureerd op de server.",
        code: "not_configured",
      });
      expect(JSON.stringify(body)).not.toMatch(/CALENDAR_ICS_URL|HOME_ASSISTANT|INTERVALS/);
    }

    const unknown = await fetch(`${server.baseUrl}/api/unknown-route`, { headers });
    expect(unknown.status).toBe(404);
  });
});
