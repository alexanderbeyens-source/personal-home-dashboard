import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

describe("protected API routes", () => {
  let child;

  afterEach(async () => {
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await once(child, "exit");
  });

  it("keeps live data routes behind GitHub session authentication", async () => {
    const portServer = createServer();
    await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
    const address = portServer.address();
    if (!address || typeof address === "string") throw new Error("Could not reserve a local test port.");
    const { port } = address;
    await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));

    child = spawn(process.execPath, ["server/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "test",
        AUTH_URL: `http://127.0.0.1:${port}`,
        AUTH_SECRET: "a-dummy-test-secret-that-is-long-enough",
        AUTH_GITHUB_ID: "test-client-id",
        AUTH_GITHUB_SECRET: "test-client-secret",
        ALLOWED_GITHUB_ID: "123456",
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
      expect(await response.json()).toEqual({ error: "Sign-in required." });
    }

    const page = await fetch(baseUrl);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");

    const newsPage = await fetch(`${baseUrl}/news`);
    expect(newsPage.status).toBe(200);
    expect(newsPage.headers.get("content-type")).toContain("text/html");
  });
});
