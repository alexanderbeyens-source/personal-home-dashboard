import { describe, expect, it } from "vitest";
import { groupAgenda } from "./agenda";

const at = (iso: string) => new Date(iso);

describe("groupAgenda", () => {
  it("groups by local day, lists ongoing all-day events under today and drops ended timed events", () => {
    const now = at("2026-11-24T10:00:00");
    const days = groupAgenda([
      { title: "Ontbijt", start: at("2026-11-24T07:00:00").toISOString(), end: at("2026-11-24T08:00:00").toISOString(), location: null },
      { title: "Tandarts", start: at("2026-11-24T14:00:00").toISOString(), end: at("2026-11-24T14:30:00").toISOString(), location: null, calendar: "Gezin" },
      { title: "Vakantie", start: at("2026-11-23T00:00:00").toISOString(), end: at("2026-11-26T00:00:00").toISOString(), allDay: true, startDate: "2026-11-23", location: null },
      { title: "Voetbal", start: at("2026-11-25T19:00:00").toISOString(), location: null },
      { title: "Verjaardag", start: at("2026-11-27T00:00:00").toISOString(), allDay: true, startDate: "2026-11-27", location: null },
    ], now);
    expect(days.map((day) => day.label)).toEqual(["Vandaag", "Morgen", "Vrijdag"]);
    expect(days[0].events.map((event) => event.title)).toEqual(["Vakantie", "Tandarts"]);
    expect(days[1].events.map((event) => event.title)).toEqual(["Voetbal"]);
  });
});
