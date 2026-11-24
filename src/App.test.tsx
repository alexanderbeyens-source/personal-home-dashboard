// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const notConfigured = { error: "Deze koppeling is niet geconfigureerd op de server.", code: "not_configured" };

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function mockApi(overrides: Record<string, () => Response> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://localhost").pathname;
    if (overrides[path]) return overrides[path]();
    if (path === "/api/auth/session") return jsonResponse({ user: { id: "1" } });
    if (path === "/api/auth/csrf") return jsonResponse({ csrfToken: "csrf" });
    if (path === "/api/calendar" || path === "/api/home-assistant") return jsonResponse(notConfigured, 503);
    if (path === "/api/projects") return jsonResponse([]);
    return jsonResponse({ error: "Live gegevens zijn tijdelijk niet beschikbaar." }, 503);
  }));
}

describe("Dashboard optional integrations", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hides unconfigured Home Assistant and Projects panels and labels the agenda as not configured", async () => {
    mockApi();
    render(<App />);

    const agenda = await screen.findByRole("heading", { name: "Agenda" });
    const agendaPanel = agenda.closest("section");
    await waitFor(() => expect(agendaPanel?.querySelector('[role="status"]')?.textContent).toBe("Niet geconfigureerd op de server"));
    expect(agendaPanel?.querySelector(".panel-alert")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Thuis, verbonden" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Door jou gemaakt" })).toBeNull();
    expect(screen.queryByText("Mobility & Home")).toBeNull();
  });

  it("shows the Home Assistant and Projects panels once they return data", async () => {
    mockApi({
      "/api/home-assistant": () => jsonResponse({ devices: [{ name: "Lamp", state: "on" }], temperature: null, vacuum: null }),
      "/api/projects": () => jsonResponse([{ name: "Portfolio", url: "https://example.com" }]),
    });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Thuis, verbonden" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Door jou gemaakt" })).toBeTruthy();
    expect(screen.getByText("Portfolio")).toBeTruthy();
  });
});

function story(index: number) {
  return {
    id: `story-${index}`,
    title: `Kop ${index}`,
    summary: `Samenvatting ${index}`,
    whySelected: null,
    source: "VRT NWS",
    sourceKind: "journalism",
    category: "belgium",
    language: "nl",
    publishedAt: "2026-11-24T08:00:00.000Z",
    link: `https://example.com/${index}`,
    coverage: [],
    sportGroup: null,
  };
}

function overview(id: string, label: string, teamName: string) {
  return {
    league: { id, label, standingsLink: "https://example.com/standings" },
    live: [],
    past: [{
      id: `${id}-1`, name: "", date: "2026-11-23T19:00:00.000Z", state: "post", status: "Final", shortStatus: "FT",
      competitors: [
        { name: teamName, abbreviation: "AAA", score: "2", homeAway: "home", logo: null, winner: true },
        { name: "Tegenstander", abbreviation: "BBB", score: "1", homeAway: "away", logo: null, winner: false },
      ],
    }],
    upcoming: [],
    standings: { name: label, entries: [] },
    players: [],
    stale: false,
    warnings: [],
  };
}

describe("Dashboard widgets", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("limits the briefing to three stories and links to the full briefing", async () => {
    mockApi({
      "/api/briefing": () => jsonResponse({ topStories: [1, 2, 3, 4, 5].map(story), stale: false, warnings: [] }),
    });
    render(<App />);

    const heading = await screen.findByRole("heading", { name: "Dagelijkse briefing" });
    const panel = heading.closest("section") as HTMLElement;
    await within(panel).findByText("Kop 1");
    expect(within(panel).getByText("Kop 3")).toBeTruthy();
    expect(within(panel).queryByText("Kop 4")).toBeNull();
    expect(within(panel).getByRole("link", { name: /Volledige briefing/ }).getAttribute("href")).toBe("/briefing");
  });

  it("switches sports competitions with tabs and remembers the choice", async () => {
    mockApi({
      "/api/sport/nba/overview": () => jsonResponse(overview("nba", "NBA", "Lakers")),
      "/api/sport/premier-league/overview": () => jsonResponse(overview("premier-league", "Premier League", "Arsenal")),
    });
    render(<App />);

    expect(await screen.findByText("Lakers")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Premier League/ }));
    expect(await screen.findByText("Arsenal")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Premier League/ }).getAttribute("aria-selected")).toBe("true");
    expect(window.localStorage.getItem("northstar.sport-tab")).toBe("premier-league");
    expect(screen.getByRole("link", { name: /Alles over Premier League/ }).getAttribute("href")).toBe("/sport/premier-league");
  });

  it("labels the IMIE quote as delayed and shows the change with an arrow", async () => {
    mockApi({
      "/api/economy": () => jsonResponse({
        generatedAt: "2026-11-24T09:20:00.000Z",
        policyRates: null,
        worldGrowth: null,
        belgiumInflation: null,
        euroAreaInflation: null,
        mortgageRates: null,
        electricityPrices: null,
        gasPrices: null,
        imiePrice: null,
        imieQuote: {
          value: 11.276, unit: "EUR", period: "2026-11-24T09:01:34.000Z", frequency: "Intraday", source: "Deutsche Börse · Xetra",
          sourceUrl: "https://example.com", priceType: "vertraagd", observationStale: false, stale: false, fetchedAt: null,
          venue: "Xetra", ticker: "SPYI", isin: "IE00B3YLTY66", previousClose: 11.334, changePercent: -0.51,
          dayLow: 11.27, dayHigh: 11.346, tradingOpen: true,
        },
        warnings: [],
      }),
    });
    render(<App />);

    expect(await screen.findByText(/€\s?11,28/)).toBeTruthy();
    expect(screen.getByText("▼ 0,51 %")).toBeTruthy();
    expect(screen.getByText(/tot 15 min vertraagd/)).toBeTruthy();
    expect(screen.queryByText(/^live$/i)).toBeNull();
  });
});

describe("Agenda widget", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows events from several calendars and names a calendar that failed", async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockApi({
      "/api/calendar": () => jsonResponse({
        events: [
          { id: "1", title: "Tandarts", start: soon, end: soon, allDay: false, startDate: null, location: "Diest", calendar: "Gezin", color: "#4f8cff" },
        ],
        calendars: [
          { name: "Gezin", color: "#4f8cff", status: "ok" },
          { name: "Werk", color: "#ff6a1a", status: "unavailable" },
        ],
        warnings: [{ source: "Werk", message: "Agenda tijdelijk niet beschikbaar.", stale: false }],
      }),
    });
    render(<App />);

    const panel = (await screen.findByRole("heading", { name: "Agenda" })).closest("section") as HTMLElement;
    expect(await within(panel).findByText("Tandarts")).toBeTruthy();
    expect(within(panel).getByText(/Gezin · .*Diest/)).toBeTruthy();
    expect(within(panel).getByText("Niet geladen: Werk")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /Volledige agenda/ }).getAttribute("href")).toBe("/agenda");
  });
});

describe("Weather widget", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows dayparts, the next days and a link to the weather page", async () => {
    const day = (date: string, max: number) => ({
      date, weatherCode: 3, temperatureMax: max, temperatureMin: -1, precipitationSum: 0, precipitationProbabilityMax: 20,
      sunrise: `${date}T08:10`, sunset: `${date}T16:42`, uvIndexMax: 1, windSpeedMax: 12,
    });
    mockApi({
      "/api/weather": () => jsonResponse({
        location: "Diest", temperature: 1, apparentTemperature: -3, humidity: 74, windSpeed: 6, weatherCode: 2, isDay: true,
        observedAt: "2026-11-24T11:15",
        today: day("2026-11-24", 4),
        dayparts: [
          { id: "morning", label: "Ochtend", from: 6, to: 12, averageTemperature: 0.4, weatherCode: 45, precipitationProbabilityMax: 0, status: "current" },
          { id: "afternoon", label: "Middag", from: 12, to: 18, averageTemperature: 3.2, weatherCode: 3, precipitationProbabilityMax: 10, status: "upcoming" },
          { id: "evening", label: "Avond", from: 18, to: 24, averageTemperature: null, weatherCode: null, precipitationProbabilityMax: null, status: "upcoming" },
        ],
        nextDays: [day("2026-11-25", 2), day("2026-11-26", 5), day("2026-11-27", 6)],
        days: [], hours: [],
      }),
    });
    render(<App />);

    const panel = (await screen.findByRole("heading", { name: "Weer" })).closest("section") as HTMLElement;
    await within(panel).findByText("Ochtend");
    expect(within(panel).getByText("3°")).toBeTruthy();
    expect(within(panel).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Morgen")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /Weerdetails/ }).getAttribute("href")).toBe("/weer");
  });
});

describe("IMIE chart", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/economie");
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the chosen range and shows the change with an honest source label", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/session") return jsonResponse({ user: { id: "1" } });
      if (url.pathname === "/api/auth/csrf") return jsonResponse({ csrfToken: "csrf" });
      if (url.pathname === "/api/economy/imie-history") {
        const range = url.searchParams.get("range") ?? "";
        requested.push(range);
        return jsonResponse({
          range,
          basis: "nav-eur",
          currency: "EUR",
          points: [{ t: "2025-11-21", v: 9.631 }, { t: "2026-05-21", v: 10.5 }, { t: "2026-11-23", v: 11.212 }],
          changePercent: range === "1y" ? 16.41 : -3.51,
          from: "2025-11-21",
          to: "2026-11-23",
          source: "State Street SPDR (NAV) · ECB (EUR/USD)",
          sourceUrl: "https://www.ssga.com/",
          note: "Officiële dagelijkse NAV in USD, omgerekend naar EUR met de ECB-referentiekoers.",
          stale: false,
          splits: [],
        });
      }
      return jsonResponse({ error: "Live gegevens zijn tijdelijk niet beschikbaar." }, 503);
    }));
    render(<App />);

    const summary = () => document.querySelector(".imie-chart-summary")?.textContent?.replace(/\s+/g, " ") ?? "";
    await waitFor(() => expect(summary()).toMatch(/▼ ?3,51 %/));
    fireEvent.click(screen.getByRole("button", { name: "1J" }));
    await waitFor(() => expect(summary()).toMatch(/▲ ?16,41 %/));
    expect(screen.getByRole("button", { name: "1J" }).getAttribute("aria-pressed")).toBe("true");
    expect(requested).toContain("1y");
    expect(screen.getByRole("img", { name: /IMIE 1 jaar/ })).toBeTruthy();
    expect(screen.getByText(/omgerekend naar EUR/)).toBeTruthy();
    expect(window.localStorage.getItem("northstar.imie-range")).toBe("1y");
  });
});

describe("Tasks widget", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const tasks = (readingDone: boolean) => ({
    today: "2026-11-24",
    sections: [
      { id: "daily", title: "Dagelijks", period: "Vandaag", items: [
        { id: "aaaaaaaaaaaaaaaa", text: "Lezen", done: readingDone, doneDate: readingDone ? "2026-11-24" : null, due: null, overdue: false },
      ] },
      { id: "weekly", title: "Wekelijks", period: "Deze week", items: [] },
      { id: "monthly", title: "Maandelijks", period: "Deze maand", items: [] },
      { id: "once", title: "Eenmalig", period: "Eenmalig", items: [
        { id: "bbbbbbbbbbbbbbbb", text: "Banden wisselen", done: false, doneDate: null, due: "2026-11-20", overdue: true },
      ] },
    ],
    overdue: 1,
    open: readingDone ? 1 : 2,
    total: 2,
    stale: false,
    updatedAt: "2026-11-24T10:00:00Z",
  });

  function stub(toggleResponse: () => Response) {
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/auth/session") return jsonResponse({ user: { id: "1" } });
      if (path === "/api/auth/csrf") return jsonResponse({ csrfToken: "csrf-token-from-auth" });
      if (path === "/api/tasks") return jsonResponse(tasks(false));
      if (path === "/api/tasks/toggle") {
        posts.push({ method: init?.method, body: JSON.parse(String(init?.body)) });
        return toggleResponse();
      }
      return jsonResponse({ error: "Live gegevens zijn tijdelijk niet beschikbaar." }, 503);
    }));
    return posts;
  }

  it("ticks a task with the CSRF token and shows overdue deadlines", async () => {
    const posts = stub(() => jsonResponse(tasks(true)));
    render(<App />);
    const checkbox = await screen.findByRole("checkbox", { name: "Lezen" }) as HTMLInputElement;
    expect(screen.getByText(/verlopen sinds 20 nov/)).toBeTruthy();
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    await waitFor(() => expect(posts).toEqual([{ method: "POST", body: { id: "aaaaaaaaaaaaaaaa", done: true, csrfToken: "csrf-token-from-auth" } }]));
    await waitFor(() => expect(screen.getByText("1/1 gedaan")).toBeTruthy());
  });

  it("restores the checkbox and explains when saving fails", async () => {
    stub(() => jsonResponse({ error: "Live gegevens zijn tijdelijk niet beschikbaar." }, 502));
    render(<App />);
    const checkbox = await screen.findByRole("checkbox", { name: "Lezen" }) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Niet opgeslagen");
    expect((screen.getByRole("checkbox", { name: "Lezen" }) as HTMLInputElement).checked).toBe(false);
  });
});

describe("Health widget", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the latest values, never shows missing values as zero, and lists the last activity", async () => {
    const day = (date: string, values: Partial<Record<string, number | null>>) => ({
      date, sleepSeconds: null, sleepScore: null, restingHr: null, hrv: null, steps: null,
      avgSleepingHr: null, readiness: null, spO2: null, respiration: null, weight: null, ...values,
    });
    mockApi({
      "/api/health": () => jsonResponse({
        today: "2026-11-24",
        days: [day("2026-11-23", { sleepSeconds: 24000, restingHr: 54 }), day("2026-11-24", { sleepSeconds: 26100, restingHr: 52 })],
        summary: {
          sleepSeconds: { value: 26100, date: "2026-11-24", average7d: null },
          sleepScore: { value: null, date: null, average7d: null },
          restingHr: { value: 52, date: "2026-11-24", average7d: 53 },
          hrv: { value: null, date: null, average7d: null },
          steps: { value: null, date: null, average7d: null },
        },
        activities: [{ id: "i1", name: "Ochtendloop", type: "Run", start: "2026-11-23T07:10:00", movingSeconds: 1800, distanceMeters: 5200, averageHr: 148, calories: null, trainingLoad: 42 }],
        stale: false,
        warnings: [],
        source: "Garmin via intervals.icu",
        sourceUrl: "https://intervals.icu/",
      }),
    });
    render(<App />);
    const panel = (await screen.findByRole("heading", { name: "Gezondheid" })).closest("section") as HTMLElement;
    expect(await within(panel).findByText("7 u 15")).toBeTruthy();
    expect(within(panel).getByText(/gem\. 7 d 53/)).toBeTruthy();
    expect(within(panel).getAllByText("Niet beschikbaar")).toHaveLength(2);
    expect(within(panel).getByText("Ochtendloop")).toBeTruthy();
    expect(within(panel).getByText(/Lopen · 30 min · 5,2 km · gem\. 148 bpm/)).toBeTruthy();
  });
});

describe("Agenda configuration errors", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the safe explanation instead of a generic failure", async () => {
    const message = "De agendaconfiguratie bevat gekrulde aanhalingstekens (“ ”). Gebruik gewone rechte aanhalingstekens (\").";
    mockApi({ "/api/calendar": () => jsonResponse({ error: message, code: "invalid_config" }, 500) });
    render(<App />);
    const panel = (await screen.findByRole("heading", { name: "Agenda" })).closest("section") as HTMLElement;
    expect((await within(panel).findAllByText(`Laden mislukt: ${message}`)).length).toBeGreaterThan(0);
    expect(within(panel).queryByText(/tijdelijk niet beschikbaar/)).toBeNull();
  });
});
