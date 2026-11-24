import { createHash } from "node:crypto";

// Task list stored as Markdown in a private GitHub repository, so it can be edited by
// hand or by Claude, and ticked off from the dashboard. Format:
//
//   ## Dagelijks | ## Wekelijks | ## Maandelijks | ## Eenmalig
//   - [ ] Task text
//   - [x] Task text (2026-11-24)      <- date it was last done
//   - [ ] One-off task @2026-12-01    <- optional deadline
//
// A recurring task counts as done when its date falls in the current day, week
// (Monday-Sunday) or month. Anything else in the file is kept untouched.

export const TASKS_TIMEZONE = "Europe/Brussels";
export const SECTIONS = [
  { id: "daily", title: "Dagelijks", period: "Vandaag", match: /^(dagelijks|daily|dagelijkse taken)$/i },
  { id: "weekly", title: "Wekelijks", period: "Deze week", match: /^(wekelijks|weekly|wekelijkse taken)$/i },
  { id: "monthly", title: "Maandelijks", period: "Deze maand", match: /^(maandelijks|monthly|maandelijkse taken)$/i },
  { id: "once", title: "Eenmalig", period: "Eenmalig", match: /^(eenmalig|eenmalige taken|once|one-off|todo|te doen)$/i },
];

const TASK_LINE = /^(\s*[-*] \[)( |x|X)(\] )(.*?)\s*$/;
const DONE_SUFFIX = /\s+\((\d{4}-\d{2}-\d{2})\)$/;
const DUE = /(?:^|\s)@(\d{4}-\d{2}-\d{2})\b/;
const MAX_TEXT = 300;

export function localDate(timestamp, timeZone = TASKS_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function periodStart(sectionId, today) {
  if (sectionId === "daily") return today;
  if (sectionId === "weekly") {
    const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    return addDays(today, -weekday);
  }
  if (sectionId === "monthly") return `${today.slice(0, 7)}-01`;
  return null;
}

function taskId(sectionId, text, occurrence) {
  return createHash("sha256").update(`${sectionId}\n${text}\n${occurrence}`).digest("hex").slice(0, 16);
}

// Returns { sections, lines, eol } where every task keeps its line index so a toggle can
// rewrite exactly one line.
export function parseTasks(markdown, today) {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const sections = SECTIONS.map((section) => ({ id: section.id, title: section.title, period: section.period, items: [] }));
  let current = null;
  const seen = new Map();
  lines.forEach((line, index) => {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const definition = SECTIONS.find((section) => section.match.test(heading[1].trim()));
      current = definition ? sections.find((section) => section.id === definition.id) : null;
      return;
    }
    if (!current) return;
    const match = line.match(TASK_LINE);
    if (!match) return;
    const checked = match[2].toLowerCase() === "x";
    const rest = match[4];
    const doneDate = rest.match(DONE_SUFFIX)?.[1] ?? null;
    const text = rest.replace(DONE_SUFFIX, "").trim().slice(0, MAX_TEXT);
    if (!text) return;
    const due = text.match(DUE)?.[1] ?? null;
    const key = `${current.id}\n${text}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    const start = periodStart(current.id, today);
    // Recurring: done only if the recorded date is in the current period. Without a date
    // a ticked recurring task is shown as done (it was ticked by hand without a date).
    const done = current.id === "once" ? checked : checked && (doneDate === null || doneDate >= start);
    current.items.push({
      id: taskId(current.id, text, occurrence),
      text: text.replace(DUE, " ").replace(/\s+/g, " ").trim(),
      done,
      doneDate: checked ? doneDate : null,
      due,
      overdue: Boolean(due && !done && due < today),
      line: index,
    });
  });
  return { sections, lines, eol };
}

export function publicTasks(parsed, today) {
  const sections = parsed.sections.map((section) => ({
    id: section.id,
    title: section.title,
    period: section.period,
    items: section.items.map(({ line, ...item }) => item),
  }));
  const all = sections.flatMap((section) => section.items.map((item) => ({ ...item, section: section.id })));
  return {
    today,
    sections,
    overdue: all.filter((item) => item.overdue).length,
    open: all.filter((item) => !item.done).length,
    total: all.length,
  };
}

// Rewrites only the line of the given task. Throws a 404-style error if it no longer exists.
export function toggleTask(markdown, { id, done, today }) {
  const parsed = parseTasks(markdown, today);
  const task = parsed.sections.flatMap((section) => section.items).find((item) => item.id === id);
  if (!task) {
    const error = new Error("Deze taak bestaat niet meer; vernieuw de lijst.");
    error.status = 409;
    throw error;
  }
  const line = parsed.lines[task.line];
  const match = line.match(TASK_LINE);
  const body = match[4].replace(DONE_SUFFIX, "");
  parsed.lines[task.line] = done ? `${match[1]}x${match[3]}${body} (${today})` : `${match[1]} ${match[3]}${body}`;
  return { markdown: parsed.lines.join(parsed.eol), task: { ...task, done } };
}

function badTask(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Validates user input for a new task and returns the text that goes after "- [ ] ".
export function newTaskLine({ section, text, due }) {
  const definition = SECTIONS.find((entry) => entry.id === section);
  if (!definition) throw badTask("Kies een geldige rubriek.");
  if (typeof text !== "string") throw badTask("Geef een taak in.");
  // One line, no control characters: a newline could inject headings or extra tasks.
  const clean = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) throw badTask("Geef een taak in.");
  if (clean.length > MAX_TEXT) throw badTask(`Een taak mag hoogstens ${MAX_TEXT} tekens lang zijn.`);
  if (DONE_SUFFIX.test(clean)) throw badTask("Een taak mag niet eindigen op een datum tussen haakjes.");
  if (due !== undefined && due !== null && due !== "") {
    if (section !== "once") throw badTask("Een deadline kan alleen bij een eenmalige taak.");
    if (typeof due !== "string" || !isRealDate(due)) throw badTask("Ongeldige deadline.");
    if (DUE.test(clean)) throw badTask("Geef de deadline ofwel in de tekst ofwel in het datumveld.");
    return { definition, body: `${clean} @${due}` };
  }
  return { definition, body: clean };
}

// Inserts the task after the last task of its section (or right under the heading), or
// appends a new section heading when the file has none. Every other line stays untouched.
export function addTask(markdown, input) {
  const { definition, body } = newTaskLine(input);
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  let insertAt = -1;
  let inSection = false;
  let indent = "- ";
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (inSection) break; // only the first matching section is used
      inSection = definition.match.test(heading[1].trim());
      if (inSection) insertAt = index + 1;
      continue;
    }
    const task = inSection && lines[index].match(TASK_LINE);
    if (task) {
      insertAt = index + 1;
      indent = task[1].slice(0, -1);
    }
  }
  const line = `${indent}[ ] ${body}`;
  if (insertAt === -1) {
    const trailing = lines.length > 1 && lines[lines.length - 1] === "";
    if (trailing) lines.pop();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length) lines.push("");
    lines.push(`## ${definition.title}`, line);
    if (trailing || markdown === "") lines.push("");
  } else {
    lines.splice(insertAt, 0, line);
  }
  const text = body.replace(DUE, " ").replace(/\s+/g, " ").trim();
  return { markdown: lines.join(eol), task: { section: definition.id, text } };
}

export function tasksConfigFromEnv(env) {
  const token = env.GITHUB_TASKS_TOKEN?.trim();
  const repo = env.GITHUB_TASKS_REPO?.trim();
  if (!token || !repo) return null;
  const path = env.GITHUB_TASKS_PATH?.trim() || "tasks.md";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9_./-]+\.md$/.test(path) || path.split("/").includes("..") || path.startsWith("/")) {
    const error = new Error("De takenkoppeling is ongeldig ingesteld.");
    error.status = 500;
    error.kind = "config";
    error.code = "invalid_config";
    error.reason = "invalid-repo";
    throw error;
  }
  return { token, repo, path };
}

// github(method, body?) must return { status, json } for the configured file.
export function createTasksService({ github, now = () => Date.now(), ttlMs = 60 * 1000 }) {
  let cache = null;
  let inFlight = null;

  async function readFile() {
    const { status, json } = await github("GET");
    if (status === 404) {
      const error = new Error("Het takenbestand werd niet gevonden in de repository.");
      error.status = 502;
      throw error;
    }
    if (status !== 200 || typeof json?.content !== "string" || typeof json?.sha !== "string") {
      const error = new Error("GitHub returned an error status.");
      error.status = 502;
      error.upstreamStatus = status;
      throw error;
    }
    return { markdown: Buffer.from(json.content, "base64").toString("utf8"), sha: json.sha };
  }

  async function get({ refresh = false } = {}) {
    const today = localDate(now());
    if (!refresh && cache && cache.expiresAt > now() && cache.today === today) return cache.value;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const file = await readFile();
        const value = { ...publicTasks(parseTasks(file.markdown, today), today), stale: false, updatedAt: new Date(now()).toISOString() };
        cache = { value, expiresAt: now() + ttlMs, today };
        return value;
      } catch (error) {
        if (cache) return { ...cache.value, stale: true };
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  // Reads the file, applies change(markdown) and commits against the read sha. A 409/422
  // means the file changed in between: re-read and retry, at most three times.
  async function commit(change) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const file = await readFile();
      const { markdown, message } = change(file.markdown);
      if (markdown === file.markdown) break;
      const { status } = await github("PUT", {
        message,
        content: Buffer.from(markdown, "utf8").toString("base64"),
        sha: file.sha,
      });
      if (status === 200 || status === 201) break;
      if (status !== 409 && status !== 422) {
        const error = new Error("GitHub returned an error status.");
        error.status = 502;
        error.upstreamStatus = status;
        throw error;
      }
      if (attempt === 2) {
        const error = new Error("Het takenbestand werd tegelijk gewijzigd; probeer opnieuw.");
        error.status = 409;
        throw error;
      }
    }
    cache = null;
    return get({ refresh: true });
  }

  function toggle({ id, done }) {
    const today = localDate(now());
    return commit((current) => {
      const { markdown, task } = toggleTask(current, { id, done, today });
      return { markdown, message: `${done ? "Afgevinkt" : "Heropend"} via Northstar: ${task.text.slice(0, 60)}` };
    });
  }

  async function add(input) {
    newTaskLine(input); // reject invalid input before contacting GitHub
    return commit((current) => {
      const { markdown, task } = addTask(current, input);
      return { markdown, message: `Toegevoegd via Northstar: ${task.text.slice(0, 60)}` };
    });
  }

  return { get, toggle, add };
}
