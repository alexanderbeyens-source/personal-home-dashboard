import { useEffect, useId, useState, type FormEvent } from "react";
import { LOCALE } from "../format";
import type { LiveResource, TaskItem, TaskSection, TasksData } from "../types";

function formatDue(date: string, today: string) {
  if (date === today) return "vandaag";
  const label = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  return date < today ? `verlopen sinds ${label}` : `tegen ${label}`;
}

// Wraps the tasks resource with optimistic toggling: the checkbox changes at once,
// the server response replaces the list, and a failure restores the previous state.
export function useTaskToggle(resource: LiveResource<TasksData>, csrfToken: string) {
  const [override, setOverride] = useState<TasksData | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOverride(null);
  }, [resource.data]);

  const data = override ?? resource.data;

  async function toggle(item: TaskItem) {
    if (!data || pending.has(item.id)) return;
    const previous = data;
    const done = !item.done;
    setError(null);
    setPending((current) => new Set(current).add(item.id));
    setOverride({
      ...data,
      sections: data.sections.map((section) => ({
        ...section,
        items: section.items.map((entry) => (entry.id === item.id ? { ...entry, done, overdue: done ? false : entry.overdue } : entry)),
      })),
    });
    try {
      const response = await fetch("/api/tasks/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, done, csrfToken }),
      });
      const payload = (await response.json().catch(() => null)) as (TasksData & { error?: string }) | null;
      if (response.status === 401) window.dispatchEvent(new Event("northstar:session-expired"));
      if (!response.ok || !payload?.sections) throw new Error(payload?.error ?? "Opslaan mislukt.");
      setOverride(payload);
    } catch (caught) {
      setOverride(previous);
      setError(`Niet opgeslagen: ${caught instanceof Error ? caught.message : "onbekende fout"}`);
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  return { data, toggle, pending, error, replace: setOverride };
}

const SECTION_OPTIONS: { id: TaskSection["id"]; label: string }[] = [
  { id: "once", label: "Eenmalig" },
  { id: "daily", label: "Dagelijks" },
  { id: "weekly", label: "Wekelijks" },
  { id: "monthly", label: "Maandelijks" },
];

// Adds a task to the task file. The server answers with the full updated list, which
// replaces the current one; on failure the input stays so nothing typed is lost.
export function TaskAddForm({ csrfToken, onAdded, compact = false }: { csrfToken: string; onAdded: (data: TasksData) => void; compact?: boolean }) {
  const id = useId();
  const [text, setText] = useState("");
  const [section, setSection] = useState<TaskSection["id"]>("once");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/tasks/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, text, due: section === "once" && due ? due : null, csrfToken }),
      });
      const payload = (await response.json().catch(() => null)) as (TasksData & { error?: string }) | null;
      if (response.status === 401) window.dispatchEvent(new Event("northstar:session-expired"));
      if (!response.ok || !payload?.sections) throw new Error(payload?.error ?? "Opslaan mislukt.");
      onAdded(payload);
      const label = SECTION_OPTIONS.find((option) => option.id === section)?.label ?? "";
      setMessage({ tone: "ok", text: `Toegevoegd aan ${label}.` });
      setText("");
      setDue("");
    } catch (caught) {
      setMessage({ tone: "error", text: `Niet opgeslagen: ${caught instanceof Error ? caught.message : "onbekende fout"}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`task-add${compact ? " is-compact" : ""}`} onSubmit={submit} aria-label="Taak toevoegen">
      <label className="task-add-text" htmlFor={`${id}-text`}>
        <span>Nieuwe taak</span>
        <input id={`${id}-text`} type="text" value={text} maxLength={300} required disabled={busy} onChange={(event) => setText(event.target.value)} />
      </label>
      <label htmlFor={`${id}-section`}>
        <span>Rubriek</span>
        <select id={`${id}-section`} value={section} disabled={busy} onChange={(event) => setSection(event.target.value as TaskSection["id"])}>
          {SECTION_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {section === "once" && (
        <label htmlFor={`${id}-due`}>
          <span>Deadline (optioneel)</span>
          <input id={`${id}-due`} type="date" value={due} disabled={busy} onChange={(event) => setDue(event.target.value)} />
        </label>
      )}
      <button type="submit" className="button-primary" disabled={busy || !text.trim()}>{busy ? "Opslaan…" : "Toevoegen"}</button>
      {message && (
        <p className={message.tone === "error" ? "task-error" : "task-added"} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>
      )}
    </form>
  );
}

export function TaskRow({ item, today, busy, onToggle }: { item: TaskItem; today: string; busy: boolean; onToggle: (item: TaskItem) => void }) {
  return (
    <li className={`task-row${item.done ? " is-done" : ""}${item.overdue ? " is-overdue" : ""}`}>
      <label>
        <input type="checkbox" checked={item.done} disabled={busy} onChange={() => onToggle(item)} />
        <span className="task-text">{item.text}</span>
      </label>
      {item.due && !item.done && <span className={`task-due${item.overdue ? " is-overdue" : ""}`}>{formatDue(item.due, today)}</span>}
    </li>
  );
}

export function TaskGroup({ section, items, today, pending, onToggle, title }: {
  section: TaskSection;
  items?: TaskItem[];
  today: string;
  pending: Set<string>;
  onToggle: (item: TaskItem) => void;
  title?: string;
}) {
  const list = items ?? section.items;
  const done = section.items.filter((item) => item.done).length;
  return (
    <section className="task-group" aria-label={title ?? section.period}>
      <h3 className="task-group-title">
        {title ?? section.period}
        {section.id !== "once" && section.items.length > 0 && <span>{done}/{section.items.length} gedaan</span>}
      </h3>
      {list.length ? (
        <ul className="task-list">
          {list.map((item) => <TaskRow key={item.id} item={item} today={today} busy={pending.has(item.id)} onToggle={onToggle} />)}
        </ul>
      ) : (
        <p className="task-empty">{section.items.length ? "Alles gedaan." : "Geen taken."}</p>
      )}
    </section>
  );
}

// Dashboard view: open recurring tasks per period and one-off tasks that are overdue or due within a week.
export function dashboardOnceItems(section: TaskSection | undefined, today: string) {
  if (!section) return [];
  const limit = new Date(`${today}T12:00:00`);
  limit.setDate(limit.getDate() + 7);
  const horizon = limit.toISOString().slice(0, 10);
  return section.items.filter((item) => !item.done && item.due && item.due <= horizon);
}
