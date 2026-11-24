import { describe, expect, it, vi } from "vitest";
import { calendarsFromEnv, createCalendarService, expandCalendar, normalizeCalendarUrl } from "./calendar.js";

const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Brussels
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
DTSTART:19810329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZNAME:CEST
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
DTSTART:19961027T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZNAME:CET
END:STANDARD
END:VTIMEZONE`;

function ics(...events) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apple Inc.//iCloud//EN", VTIMEZONE, ...events, "END:VCALENDAR"].join("\r\n");
}

const calendar = { id: "cal-1", name: "Gezin", color: "#4f8cff", url: "https://example.com/a.ics" };
const from = Date.parse("2026-11-24T00:00:00Z");
const to = Date.parse("2026-12-08T00:00:00Z");

describe("calendar configuration", () => {
  it("reads several named calendars and converts webcal links", () => {
    const calendars = calendarsFromEnv({
      CALENDAR_ICS_URLS: JSON.stringify([
        { name: "Gezin", url: "webcal://p01-caldav.icloud.com/published/2/abc", color: "#4f8cff" },
        { name: "Werk", url: "https://p02-caldav.icloud.com/published/2/def" },
      ]),
    });
    expect(calendars).toHaveLength(2);
    expect(calendars[0]).toMatchObject({ name: "Gezin", color: "#4f8cff", url: "https://p01-caldav.icloud.com/published/2/abc" });
    expect(calendars[1].color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(calendars[1].color).not.toBe("#4f8cff");
  });

  it("keeps the single-URL variable working", () => {
    expect(calendarsFromEnv({ CALENDAR_ICS_URL: "webcal://example.com/cal.ics" })).toEqual([
      expect.objectContaining({ name: "Agenda", url: "https://example.com/cal.ics" }),
    ]);
    expect(calendarsFromEnv({})).toEqual([]);
  });

  it("rejects invalid configuration without echoing the secret URL", () => {
    for (const value of ["not json", "[]", JSON.stringify([{ name: "x", url: "http://insecure.example/secret-token" }])]) {
      expect(() => calendarsFromEnv({ CALENDAR_ICS_URLS: value })).toThrow();
      try {
        calendarsFromEnv({ CALENDAR_ICS_URLS: value });
      } catch (error) {
        expect(error.message).not.toContain("secret-token");
      }
    }
    expect(normalizeCalendarUrl("https://user:pw@example.com/x")).toBeNull();
  });
});

describe("calendar expansion", () => {
  it("expands a weekly series that started long before the window, honouring EXDATE", () => {
    const events = expandCalendar(ics(
      "BEGIN:VEVENT",
      "UID:weekly-1",
      "SUMMARY:Zwemles",
      "DTSTART;TZID=Europe/Brussels:20240106T100000",
      "DTEND;TZID=Europe/Brussels:20240106T110000",
      "RRULE:FREQ=WEEKLY;BYDAY=SA",
      "EXDATE;TZID=Europe/Brussels:20261205T100000",
      "END:VEVENT",
    ), { from, to, calendar });
    expect(events.map((event) => event.start)).toEqual(["2026-11-28T09:00:00.000Z"]);
    expect(events[0]).toMatchObject({ title: "Zwemles", calendar: "Gezin", color: "#4f8cff", allDay: false });
  });

  it("reaches the window for a daily series started years ago", () => {
    const events = expandCalendar(ics(
      "BEGIN:VEVENT",
      "UID:daily-1",
      "SUMMARY:Medicatie",
      "DTSTART;TZID=Europe/Brussels:20180101T080000",
      "DTEND;TZID=Europe/Brussels:20180101T081500",
      "RRULE:FREQ=DAILY",
      "END:VEVENT",
    ), { from, to, calendar });
    expect(events).toHaveLength(14);
    expect(events[0].start).toBe("2026-11-24T07:00:00.000Z");
  });

  it("applies a moved occurrence (RECURRENCE-ID) and drops cancelled ones", () => {
    const events = expandCalendar(ics(
      "BEGIN:VEVENT",
      "UID:team",
      "SUMMARY:Teamoverleg",
      "DTSTART;TZID=Europe/Brussels:20261102T090000",
      "DTEND;TZID=Europe/Brussels:20261102T100000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=6",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:team",
      "RECURRENCE-ID;TZID=Europe/Brussels:20261130T090000",
      "SUMMARY:Teamoverleg (verplaatst)",
      "DTSTART;TZID=Europe/Brussels:20261201T140000",
      "DTEND;TZID=Europe/Brussels:20261201T150000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:cancelled",
      "SUMMARY:Geannuleerd",
      "STATUS:CANCELLED",
      "DTSTART;TZID=Europe/Brussels:20261126T090000",
      "END:VEVENT",
    ), { from, to, calendar });
    expect(events.map((event) => [event.title, event.start])).toEqual([
      ["Teamoverleg (verplaatst)", "2026-12-01T13:00:00.000Z"],
      ["Teamoverleg", "2026-12-07T08:00:00.000Z"],
    ]);
  });

  it("marks all-day events and handles the summer-time offset", () => {
    const events = expandCalendar(ics(
      "BEGIN:VEVENT",
      "UID:allday",
      "SUMMARY:Verjaardag oma",
      "DTSTART;VALUE=DATE:20261127",
      "DTEND;VALUE=DATE:20261128",
      "END:VEVENT",
    ), { from, to, calendar });
    expect(events[0]).toMatchObject({ allDay: true, startDate: "2026-11-27", start: "2026-11-26T23:00:00.000Z" });

    const summer = expandCalendar(ics(
      "BEGIN:VEVENT",
      "UID:summer",
      "SUMMARY:Zomer",
      "DTSTART;TZID=Europe/Brussels:20260701T100000",
      "DTEND;TZID=Europe/Brussels:20260701T110000",
      "END:VEVENT",
    ), { from: Date.parse("2026-07-01T00:00:00Z"), to: Date.parse("2026-07-02T00:00:00Z"), calendar });
    expect(summer[0].start).toBe("2026-07-01T08:00:00.000Z");
  });
});

describe("calendar service", () => {
  const calendars = [
    { id: "cal-1", name: "Gezin", color: "#4f8cff", url: "https://example.com/a.ics" },
    { id: "cal-2", name: "Werk", color: "#ff6a1a", url: "https://example.com/b.ics" },
  ];
  const single = (uid, title, start) => ics("BEGIN:VEVENT", `UID:${uid}`, `SUMMARY:${title}`, `DTSTART;TZID=Europe/Brussels:${start}`, `DTEND;TZID=Europe/Brussels:${start}`, "END:VEVENT");

  it("merges calendars and keeps the rest when one fails", async () => {
    const fetchText = vi.fn(async (url) => {
      if (url.endsWith("a.ics")) return single("a", "Tandarts", "20261125T090000");
      throw new Error("Data source returned 404");
    });
    const service = createCalendarService({ fetchText, now: () => from, getCalendars: () => calendars });
    const result = await service.get();
    expect(result.events.map((event) => event.title)).toEqual(["Tandarts"]);
    expect(result.warnings).toEqual([{ source: "Werk", message: "Agenda tijdelijk niet beschikbaar.", stale: false }]);
    expect(JSON.stringify(result)).not.toContain("example.com");
  });

  it("serves the last good copy of a calendar when a refresh fails", async () => {
    let fail = false;
    const fetchText = vi.fn(async () => {
      if (fail) throw new Error("down");
      return single("a", "Tandarts", "20261125T090000");
    });
    const service = createCalendarService({ fetchText, now: () => from, getCalendars: () => calendars.slice(0, 1) });
    await service.get();
    fail = true;
    const result = await service.get({ refresh: true });
    expect(result.events).toHaveLength(1);
    expect(result.calendars[0].status).toBe("stale");
  });

  it("fails as a whole only when no calendar loads", async () => {
    const service = createCalendarService({ fetchText: vi.fn(async () => { throw new Error("down"); }), now: () => from, getCalendars: () => calendars });
    await expect(service.get()).rejects.toMatchObject({ status: 502 });
  });
});
