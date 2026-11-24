import { LOCALE, formatTime } from "../format";
import type { CalendarData, CalendarEvent } from "../types";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastAllDayDate(event: CalendarEvent) {
  if (!event.end) return event.startDate ?? null;
  const end = new Date(event.end);
  end.setMinutes(end.getMinutes() - 1);
  return localDateKey(end);
}

function dayLabel(key: string, today: string) {
  if (key === today) return "Vandaag";
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === localDateKey(tomorrow)) return "Morgen";
  const label = new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(new Date(`${key}T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface AgendaDay {
  key: string;
  label: string;
  events: CalendarEvent[];
}

// Groups events per local day. All-day events that started earlier but are still
// running are listed under today; timed events that already ended are dropped.
export function groupAgenda(events: CalendarEvent[], now = new Date()): AgendaDay[] {
  const today = localDateKey(now);
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!event.allDay && event.end && Date.parse(event.end) < now.getTime()) continue;
    const startKey = event.allDay && event.startDate ? event.startDate : localDateKey(new Date(event.start));
    const key = startKey < today ? today : startKey;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, dayEvents]) => ({
      key,
      label: dayLabel(key, today),
      events: dayEvents.sort((first, second) => Number(Boolean(second.allDay)) - Number(Boolean(first.allDay)) || Date.parse(first.start) - Date.parse(second.start)),
    }));
}

function formatShortDate(key: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(new Date(`${key}T12:00:00`));
}

export function AgendaEvent({ event }: { event: CalendarEvent }) {
  const lastDay = event.allDay ? lastAllDayDate(event) : null;
  const multiDay = event.allDay && lastDay && event.startDate && lastDay > event.startDate;
  return (
    <li className="agenda-event">
      <span className="agenda-when">
        {event.allDay ? <span className="agenda-allday">Hele dag</span> : <time dateTime={event.start}>{formatTime(event.start)}</time>}
      </span>
      <span className="agenda-dot" style={{ background: event.color ?? "var(--accent)" }} aria-hidden="true" />
      <span className="agenda-body">
        <strong>{event.title}</strong>
        <small>
          {[
            event.calendar,
            !event.allDay && event.end && event.end !== event.start ? `tot ${formatTime(event.end)}` : null,
            multiDay && lastDay ? `t/m ${formatShortDate(lastDay)}` : null,
            event.location,
          ].filter(Boolean).join(" · ")}
        </small>
      </span>
    </li>
  );
}

export function AgendaDays({ days, maxDays, maxPerDay }: { days: AgendaDay[]; maxDays?: number; maxPerDay?: number }) {
  return (
    <div className="agenda-days">
      {days.slice(0, maxDays ?? days.length).map((day) => (
        <section key={day.key} className="agenda-day" aria-label={day.label}>
          <h3 className="agenda-day-title">{day.label} <span>{formatShortDate(day.key)}</span></h3>
          <ul className="agenda-events">
            {day.events.slice(0, maxPerDay ?? day.events.length).map((event) => <AgendaEvent key={event.id ?? `${event.start}-${event.title}`} event={event} />)}
          </ul>
          {maxPerDay && day.events.length > maxPerDay && <p className="agenda-more">+{day.events.length - maxPerDay} meer</p>}
        </section>
      ))}
    </div>
  );
}

export function CalendarLegend({ data }: { data: CalendarData }) {
  if (!data.calendars || data.calendars.length < 2) return null;
  return (
    <ul className="calendar-legend" aria-label="Agenda's">
      {data.calendars.map((calendar) => (
        <li key={calendar.name} className={calendar.status === "unavailable" ? "is-unavailable" : undefined}>
          <span className="agenda-dot" style={{ background: calendar.color }} aria-hidden="true" />
          {calendar.name}
          {calendar.status === "unavailable" && <span className="tag tag-warning">niet beschikbaar</span>}
          {calendar.status === "stale" && <span className="tag tag-warning">verouderd</span>}
        </li>
      ))}
    </ul>
  );
}
