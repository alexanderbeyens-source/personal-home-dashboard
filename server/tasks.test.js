import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isAllowedOrigin, verifyCsrfToken } from "./csrf.js";
import { createTasksService, parseTasks, periodStart, publicTasks, tasksConfigFromEnv, toggleTask } from "./tasks.js";

const FILE = [
  "# Taken",
  "",
  "Instructies voor Claude: laat de koppen staan.",
  "",
  "## Dagelijks",
  "- [x] Planten water geven (2026-11-24)",
  "- [x] Medicatie (2026-11-23)",
  "- [ ] Lezen",
  "",
  "## Wekelijks",
  "- [x] Vuilnis buiten (2026-11-23)",
  "- [x] Stofzuigen (2026-11-20)",
  "",
  "## Maandelijks",
  "- [x] Facturen nakijken (2026-11-02)",
  "- [ ] Back-up foto's",
  "",
  "## Eenmalig",
  "- [ ] Banden wisselen @2026-11-20",
  "- [ ] Cadeau kopen @2026-12-05",
  "- [x] Paspoort vernieuwen (2026-10-01)",
  "",
  "## Notities",
  "- [ ] Dit is geen taak",
  "",
].join("\n");

const TODAY = "2026-11-24"; // a Tuesday

describe("task parsing", () => {
  it("computes periods with weeks starting on Monday", () => {
    expect(periodStart("daily", TODAY)).toBe("2026-11-24");
    expect(periodStart("weekly", TODAY)).toBe("2026-11-23");
    expect(periodStart("weekly", "2026-11-29")).toBe("2026-11-23");
    expect(periodStart("monthly", TODAY)).toBe("2026-11-01");
  });

  it("marks recurring tasks done only within the current period and finds overdue deadlines", () => {
    const tasks = publicTasks(parseTasks(FILE, TODAY), TODAY);
    const byText = Object.fromEntries(tasks.sections.flatMap((section) => section.items).map((item) => [item.text, item]));
    expect(byText["Planten water geven"].done).toBe(true);
    expect(byText.Medicatie.done).toBe(false);
    expect(byText["Vuilnis buiten"].done).toBe(true);
    expect(byText.Stofzuigen.done).toBe(false);
    expect(byText["Facturen nakijken"].done).toBe(true);
    expect(byText["Banden wisselen"]).toMatchObject({ due: "2026-11-20", overdue: true, done: false });
    expect(byText["Cadeau kopen"]).toMatchObject({ due: "2026-12-05", overdue: false });
    expect(byText["Paspoort vernieuwen"].done).toBe(true);
    expect(byText["Dit is geen taak"]).toBeUndefined();
    expect(tasks.overdue).toBe(1);
    expect(tasks.total).toBe(10);
  });

  it("rewrites only the toggled line and keeps the rest of the file byte for byte", () => {
    const parsed = parseTasks(FILE, TODAY);
    const reading = parsed.sections[0].items.find((item) => item.text === "Lezen");
    const { markdown } = toggleTask(FILE, { id: reading.id, done: true, today: TODAY });
    const before = FILE.split("\n");
    const after = markdown.split("\n");
    expect(after).toHaveLength(before.length);
    expect(after.filter((line, index) => line !== before[index])).toEqual(["- [x] Lezen (2026-11-24)"]);

    const medication = parsed.sections[0].items.find((item) => item.text === "Medicatie");
    const reopened = toggleTask(FILE, { id: medication.id, done: false, today: TODAY }).markdown;
    expect(reopened.split("\n")[6]).toBe("- [ ] Medicatie");
  });

  it("keeps Windows line endings and rejects unknown ids", () => {
    const crlf = FILE.replace(/\n/g, "\r\n");
    const id = parseTasks(crlf, TODAY).sections[0].items[2].id;
    expect(toggleTask(crlf, { id, done: true, today: TODAY }).markdown).toContain("- [x] Lezen (2026-11-24)\r\n");
    expect(() => toggleTask(FILE, { id: "0000000000000000", done: true, today: TODAY })).toThrow(/bestaat niet/);
  });

  it("validates the repository settings without echoing them", () => {
    expect(tasksConfigFromEnv({})).toBeNull();
    expect(tasksConfigFromEnv({ GITHUB_TASKS_TOKEN: "t", GITHUB_TASKS_REPO: "me/northstar-tasks" })).toEqual({ token: "t", repo: "me/northstar-tasks", path: "tasks.md" });
    expect(() => tasksConfigFromEnv({ GITHUB_TASKS_TOKEN: "t", GITHUB_TASKS_REPO: "me/x", GITHUB_TASKS_PATH: "../secrets.md" })).toThrow();
    expect(() => tasksConfigFromEnv({ GITHUB_TASKS_TOKEN: "t", GITHUB_TASKS_REPO: "https://evil.example" })).toThrow();
  });
});

describe("tasks service", () => {
  const now = () => Date.parse("2026-11-24T10:00:00Z");

  function fakeGithub(initial) {
    const state = { markdown: initial, sha: "sha-1", puts: [], conflictOnce: false };
    const github = vi.fn(async (method, body) => {
      if (method === "GET") return { status: 200, json: { content: Buffer.from(state.markdown).toString("base64"), sha: state.sha } };
      if (state.conflictOnce) {
        state.conflictOnce = false;
        state.sha = "sha-other";
        return { status: 409, json: {} };
      }
      if (body.sha !== state.sha) return { status: 409, json: {} };
      state.puts.push(body);
      state.markdown = Buffer.from(body.content, "base64").toString("utf8");
      state.sha = `sha-${state.puts.length + 1}`;
      return { status: 200, json: {} };
    });
    return { state, github };
  }

  it("ticks a task with a commit against the current sha and retries once on a conflict", async () => {
    const { state, github } = fakeGithub(FILE);
    state.conflictOnce = true;
    const service = createTasksService({ github, now });
    const tasks = await service.get();
    const reading = tasks.sections[0].items.find((item) => item.text === "Lezen");
    const updated = await service.toggle({ id: reading.id, done: true });
    expect(state.puts).toHaveLength(1);
    expect(state.puts[0].sha).toBe("sha-other");
    expect(state.puts[0].message).toBe("Afgevinkt via Northstar: Lezen");
    expect(state.markdown).toContain("- [x] Lezen (2026-11-24)");
    expect(updated.sections[0].items.find((item) => item.text === "Lezen").done).toBe(true);
  });

  it("keeps the last list when GitHub fails and reports a missing file", async () => {
    const { github } = fakeGithub(FILE);
    const service = createTasksService({ github, now, ttlMs: 0 });
    await service.get();
    github.mockImplementation(async () => ({ status: 500, json: {} }));
    expect((await service.get()).stale).toBe(true);

    const missing = createTasksService({ github: async () => ({ status: 404, json: {} }), now });
    await expect(missing.get()).rejects.toThrow(/niet gevonden/);
  });
});

describe("write protection", () => {
  const secret = "x".repeat(40);
  const token = "a".repeat(64);
  const cookie = `${token}|${createHash("sha256").update(`${token}${secret}`).digest("hex")}`;
  const cookieName = "authjs.csrf-token";

  it("accepts only the token that matches the signed cookie", () => {
    const cookieHeader = `other=1; ${cookieName}=${encodeURIComponent(cookie)}`;
    expect(verifyCsrfToken({ cookieHeader, cookieName, secret, bodyToken: token })).toBe(true);
    expect(verifyCsrfToken({ cookieHeader, cookieName, secret, bodyToken: "b".repeat(64) })).toBe(false);
    expect(verifyCsrfToken({ cookieHeader: `${cookieName}=${token}|${"0".repeat(64)}`, cookieName, secret, bodyToken: token })).toBe(false);
    expect(verifyCsrfToken({ cookieHeader: "", cookieName, secret, bodyToken: token })).toBe(false);
    expect(verifyCsrfToken({ cookieHeader, cookieName, secret, bodyToken: undefined })).toBe(false);
  });

  it("allows only the exact app origin", () => {
    expect(isAllowedOrigin("https://northstar.example", "https://northstar.example/")).toBe(true);
    expect(isAllowedOrigin("https://evil.example", "https://northstar.example/")).toBe(false);
    expect(isAllowedOrigin("https://northstar.example.evil.example", "https://northstar.example/")).toBe(false);
    expect(isAllowedOrigin("null", "https://northstar.example/")).toBe(false);
    expect(isAllowedOrigin(undefined, "https://northstar.example/")).toBe(false);
  });
});
