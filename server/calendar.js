import ICAL from "ical.js";

export const DEFAULT_TIMEZONE = "Europe/Brussels";
const WINDOW_DAYS = 14;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_OCCURRENCES_PER_EVENT = 500;
const MAX_ITERATIONS = 40000;
const MAX_EVENTS = 200;
const DEFAULT_COLORS = ["#ff6a1a", "#4f8cff", "#b06cff", "#ff4d8d", "#3ccfcf", "#e8e8e8"];

// Configuration errors carry a short machine reason for the logs ("invalid-json",
// "invalid-url:2", ...) and a Dutch message that is safe to show: both are fixed text
// plus at most a calendar number, never a URL or any part of the configured value.
function configError(message, reason) {
  const error = new Error(message);
  error.status = 500;
  error.kind = "config";
  error.code = "invalid_config";
  error.reason = reason;
  return error;
}

const SMART_QUOTES = /[\u201C\u201D\u201E\u2018\u2019\u00AB\u00BB]/;

function parseCalendarList(raw) {
  const text = String(raw).trim();
  if (SMART_QUOTES.test(text)) {
    throw configError("De agendaconfiguratie bevat gekrulde aanhalingstekens (\u201C \u201D). Gebruik gewone rechte aanhalingstekens (\").", "smart-quotes");
  }
  try {
    return JSON.parse(text);
  } catch {
    const quoted = /^(['"])([\s\S]*)\1$/.exec(text);
    if (quoted) {
      try {
        JSON.parse(quoted[2]);
        throw configError("De agendaconfiguratie staat tussen extra aanhalingstekens. Verwijder de aanhalingstekens rond de hele waarde.", "quoted");
      } catch (error) {
        if (error.code === "invalid_config") throw error;
      }
    }
    throw configError("De agendaconfiguratie is geen geldige JSON.", "invalid-json");
  }
}

export function normalizeCalendarUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return url.toString();
}

// CALENDAR_ICS_URLS: JSON array of { name, url, color? }. CALENDAR_ICS_URL stays
// supported as a single calendar. Error messages never contain the URLs.
export function calendarsFromEnv(env) {
  if (env.CALENDAR_ICS_URLS) {
    const parsed = parseCalendarList(env.CALENDAR_ICS_URLS);
    if (!Array.isArray(parsed)) {
      throw configError("De agendaconfiguratie moet een lijst zijn: zet [ en ] rond de agenda's.", "not-a-list");
    }
    if (parsed.length === 0 || parsed.length > 12) {
      throw configError("De agendaconfiguratie moet 1 tot 12 agenda's bevatten.", "list-size");
    }
    parsed.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw configError(`Agenda ${index + 1} is geen object met "name" en "url".`, `invalid-entry:${index + 1}`);
      }
      if (!("url" in entry)) {
        throw configError(`Agenda ${index + 1} heeft geen "url"-veld.`, `missing-url:${index + 1}`);
      }
    });
    const validColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    const used = new Set(parsed.map((entry) => (validColor(entry?.color) ? entry.color.toLowerCase() : null)).filter(Boolean));
    const spare = DEFAULT_COLORS.filter((color) => !used.has(color.toLowerCase()));
    let spareIndex = 0;
    return parsed.map((entry, index) => {
      const url = normalizeCalendarUrl(entry?.url);
      if (!url) throw configError(`Agenda ${index + 1} heeft geen geldige https- of webcal-link.`, `invalid-url:${index + 1}`);
      const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim().slice(0, 40) : `Agenda ${index + 1}`;
      const color = validColor(entry.color) ? entry.color : (spare[spareIndex++ % Math.max(1, spare.length)] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]);
      return { id: `cal-${index + 1}`, name, color, url };
    });
  }
  if (env.CALENDAR_ICS_URL) {
    const url = normalizeCalendarUrl(env.CALENDAR_ICS_URL);
    if (!url) throw configError("De agendalink is geen geldige https- of webcal-link.", "invalid-url:1");
    return [{ id: "cal-1", name: "Agenda", color: DEFAULT_COLORS[0], url }];
  }
  return [];
}

export function isCalendarConfigured(env) {
  return Boolean(env.CALENDAR_ICS_URLS || env.CALENDAR_ICS_URL);
}

// Converts wall-clock parts in an IANA zone to an epoch timestamp.
function zonedTimestamp(parts, timezone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let timestamp = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const shown = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, Number(part.value)]));
    timestamp += target - Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
  }
  return timestamp;
}

function isKnownZone(tzid) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
}

function toTimestamp(time) {
  const zone = time.zone;
  if (zone === ICAL.Timezone.utcTimezone) return time.toJSDate().getTime();
  const parts = { year: time.year, month: time.month, day: time.day, hour: time.hour, minute: time.minute, second: time.second };
  // Prefer the IANA database for named zones (iCloud uses IANA ids); fall back to the
  // VTIMEZONE definition, and treat floating times as local Belgian time.
  const tzid = zone?.tzid;
  if (tzid && tzid !== "floating" && isKnownZone(tzid)) return zonedTimestamp(parts, tzid);
  if (zone && zone !== ICAL.Timezone.localTimezone && tzid !== "floating") {
    return time.toUnixTime() * 1000;
  }
  return zonedTimestamp(parts, DEFAULT_TIMEZONE);
}

function dateOnly(time) {
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function occurrence(item, startTime, endTime, calendar) {
  const allDay = startTime.isDate;
  const start = allDay ? zonedTimestamp({ year: startTime.year, month: startTime.month, day: startTime.day, hour: 0, minute: 0, second: 0 }, DEFAULT_TIMEZONE) : toTimestamp(startTime);
  const end = endTime
    ? (allDay ? zonedTimestamp({ year: endTime.year, month: endTime.month, day: endTime.day, hour: 0, minute: 0, second: 0 }, DEFAULT_TIMEZONE) : toTimestamp(endTime))
    : start + (allDay ? 24 * 60 * 60 * 1000 : 0);
  return {
    id: `${calendar.id}:${item.uid || cleanText(item.summary)}:${start}`,
    title: cleanText(item.summary) || "Afspraak zonder titel",
    start: new Date(start).toISOString(),
    end: new Date(Math.max(end, start)).toISOString(),
    allDay,
    startDate: allDay ? dateOnly(startTime) : null,
    location: cleanText(item.location) || null,
    calendar: calendar.name,
    color: calendar.color,
  };
}

export function expandCalendar(icsText, { from, to, calendar }) {
  let root;
  try {
    root = new ICAL.Component(ICAL.parse(icsText));
  } catch {
    const error = new Error("Agendabestand kon niet gelezen worden.");
    error.kind = "parse";
    throw error;
  }
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const timezone = new ICAL.Timezone(vtimezone);
    if (timezone.tzid && !ICAL.TimezoneService.has(timezone.tzid)) ICAL.TimezoneService.register(timezone.tzid, timezone);
  }

  const masters = new Map();
  const exceptions = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    if (vevent.hasProperty("recurrence-id")) exceptions.push(event);
    else masters.set(event.uid || `anon-${masters.size}`, event);
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (master) master.relateException(exception);
    else masters.set(`${exception.uid}-${exception.recurrenceId}`, exception);
  }

  const events = [];
  const overlaps = (item) => Date.parse(item.end) > from && Date.parse(item.start) < to
    || (Date.parse(item.end) === Date.parse(item.start) && Date.parse(item.start) >= from && Date.parse(item.start) < to);
  const cancelled = (component) => String(component?.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

  for (const event of masters.values()) {
    if (!event.startDate) continue;
    if (!event.isRecurring()) {
      if (cancelled(event.component)) continue;
      const item = occurrence(event, event.startDate, event.endDate, calendar);
      if (overlaps(item)) events.push(item);
      continue;
    }
    const iterator = event.iterator();
    // Skip cheaply over occurrences that ended long before the window (a daily
    // series started years ago has thousands); only count those near the window.
    const skipBefore = from - 7 * 24 * 60 * 60 * 1000;
    let inWindow = 0;
    for (let steps = 0; steps < MAX_ITERATIONS && inWindow < MAX_OCCURRENCES_PER_EVENT; steps++) {
      const next = iterator.next();
      if (!next) break;
      if (next.toUnixTime() * 1000 < skipBefore) continue;
      inWindow++;
      const details = event.getOccurrenceDetails(next);
      if (cancelled(details.item.component)) continue;
      const item = occurrence(details.item, details.startDate, details.endDate, calendar);
      if (Date.parse(item.start) >= to) break;
      if (overlaps(item)) events.push(item);
    }
  }
  return events;
}

// onCalendarError(calendarId, error) is for logging; it gets the internal id ("cal-1"), never the URL.
export function createCalendarService({ fetchText, now = () => Date.now(), getCalendars, onCalendarError = () => {} }) {
  const cache = new Map();
  const inFlight = new Map();

  async function loadOne(calendar, refresh) {
    const cached = cache.get(calendar.url);
    if (!refresh && cached && cached.expiresAt > now()) return cached;
    if (inFlight.has(calendar.url)) return inFlight.get(calendar.url);
    const promise = (async () => {
      try {
        const text = await fetchText(calendar.url);
        const entry = { text, fetchedAt: now(), expiresAt: now() + CACHE_TTL_MS, stale: false };
        cache.set(calendar.url, entry);
        return entry;
      } catch (error) {
        onCalendarError(calendar.id, error);
        if (cached) {
          const retained = { ...cached, expiresAt: now() + 60 * 1000, stale: true, error };
          cache.set(calendar.url, retained);
          return retained;
        }
        throw error;
      } finally {
        inFlight.delete(calendar.url);
      }
    })();
    inFlight.set(calendar.url, promise);
    return promise;
  }

  async function get({ refresh = false, days = WINDOW_DAYS } = {}) {
    const calendars = getCalendars();
    const currentTime = now();
    const from = currentTime - 60 * 60 * 1000;
    const to = currentTime + days * 24 * 60 * 60 * 1000;
    const results = await Promise.allSettled(calendars.map((calendar) => loadOne(calendar, refresh)));
    const events = [];
    const warnings = [];
    const status = [];
    results.forEach((result, index) => {
      const calendar = calendars[index];
      if (result.status === "rejected") {
        warnings.push({ source: calendar.name, message: "Agenda tijdelijk niet beschikbaar.", stale: false });
        status.push({ name: calendar.name, color: calendar.color, status: "unavailable" });
        return;
      }
      try {
        events.push(...expandCalendar(result.value.text, { from, to, calendar }));
        if (result.value.stale) warnings.push({ source: calendar.name, message: "Vernieuwen mislukt; de laatste geslaagde versie wordt getoond.", stale: true });
        status.push({ name: calendar.name, color: calendar.color, status: result.value.stale ? "stale" : "ok" });
      } catch (error) {
        onCalendarError(calendar.id, error);
        warnings.push({ source: calendar.name, message: "Agendabestand kon niet gelezen worden.", stale: false });
        status.push({ name: calendar.name, color: calendar.color, status: "unavailable" });
      }
    });
    if (calendars.length && status.every((item) => item.status === "unavailable")) {
      const error = new Error("Geen enkele agenda kon geladen worden.");
      error.status = 502;
      throw error;
    }
    events.sort((first, second) => Date.parse(first.start) - Date.parse(second.start) || Number(second.allDay) - Number(first.allDay));
    return {
      events: events.slice(0, MAX_EVENTS),
      calendars: status,
      warnings,
      rangeEnd: new Date(to).toISOString(),
    };
  }

  return { get };
}
