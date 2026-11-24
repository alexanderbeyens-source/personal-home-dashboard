import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isAllowedOrigin, verifyCsrfToken } from "./csrf.js";
import { addTask, createTasksService, parseTasks, periodStart, publicTasks, tasksConfigFromEnv, toggleTask } from "./tasks.js";

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

describe("adding tasks", () => {
  function inserted(before, after) {
    const a = before.split("\n");
    const b = after.split("\n");
    const index = b.findIndex((line, i) => line !== a[i]);
    expect([...b.slice(0, index), ...b.slice(index + 1)]).toEqual(a);
    return { index, line: b[index] };
  }

  it("inserts after the last task of the section and keeps the rest byte for byte", () => {
    expect(inserted(FILE, addTask(FILE, { section: "daily", text: "Wandelen" }).markdown)).toEqual({ index: 8, line: "- [ ] Wandelen" });
    expect(inserted(FILE, addTask(FILE, { section: "weekly", text: "Was doen" }).markdown)).toEqual({ index: 12, line: "- [ ] Was doen" });
    const once = addTask(FILE, { section: "once", text: "  Belasting\n## Dagelijks\n- [x] indienen ", due: "2026-12-15" });
    expect(inserted(FILE, once.markdown)).toEqual({ index: 21, line: "- [ ] Belasting ## Dagelijks - [x] indienen @2026-12-15" });
    expect(once.task).toEqual({ section: "once", text: "Belasting ## Dagelijks - [x] indienen" });
    const item = publicTasks(parseTasks(once.markdown, TODAY), TODAY).sections[3].items.at(-1);
    expect(item).toMatchObject({ text: "Belasting ## Dagelijks - [x] indienen", due: "2026-12-15", done: false });
  });

  it("puts a task under an empty heading and creates a missing section at the end", () => {
    expect(addTask("## Wekelijks\n\n## Eenmalig\n", { section: "weekly", text: "A" }).markdown).toBe("## Wekelijks\n- [ ] A\n\n## Eenmalig\n");
    expect(addTask("# Taken\n\n## Dagelijks\n- [ ] B\n\n", { section: "monthly", text: "C" }).markdown).toBe("# Taken\n\n## Dagelijks\n- [ ] B\n\n## Maandelijks\n- [ ] C\n");
    expect(addTask("", { section: "once", text: "D" }).markdown).toBe("## Eenmalig\n- [ ] D\n");
    expect(addTask("## Dagelijks\r\n- [ ] B\r\n", { section: "daily", text: "E" }).markdown).toBe("## Dagelijks\r\n- [ ] B\r\n- [ ] E\r\n");
  });

  it("rejects invalid input", () => {
    expect(() => addTask(FILE, { section: "notes", text: "A" })).toThrow(/rubriek/);
    expect(() => addTask(FILE, { section: "daily", text: "  \n " })).toThrow(/Geef een taak/);
    expect(() => addTask(FILE, { section: "daily", text: 42 })).toThrow(/Geef een taak/);
    expect(() => addTask(FILE, { section: "daily", text: "x".repeat(301) })).toThrow(/300/);
    expect(() => addTask(FILE, { section: "daily", text: "Iets (2026-11-01)" })).toThrow(/haakjes/);
    expect(() => addTask(FILE, { section: "daily", text: "A", due: "2026-12-01" })).toThrow(/eenmalige/);
    expect(() => addTask(FILE, { section: "once", text: "A", due: "2026-02-30" })).toThrow(/Ongeldige deadline/);
    expect(() => addTask(FILE, { section: "once", text: "A @2026-12-01", due: "2026-12-02" })).toThrow(/ofwel/);
    try {
      addTask(FILE, { section: "once", text: "" });
    } catch (error) {
      expect(error.status).toBe(400);
    }
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

  it("adds a task with a commit and returns the updated list", async () => {
    const { state, github } = fakeGithub(FILE);
    const service = createTasksService({ github, now });
    const updated = await service.add({ section: "once", text: "Tandarts bellen", due: "2026-11-28" });
    expect(state.puts).toHaveLength(1);
    expect(state.puts[0].message).toBe("Toegevoegd via Northstar: Tandarts bellen");
    expect(state.markdown).toContain("- [ ] Tandarts bellen @2026-11-28\n");
    expect(updated.sections[3].items.at(-1)).toMatchObject({ text: "Tandarts bellen", due: "2026-11-28" });
    expect(updated.total).toBe(11);

    github.mockClear();
    await expect(service.add({ section: "once", text: "" })).rejects.toMatchObject({ status: 400 });
    expect(github).not.toHaveBeenCalled();
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
