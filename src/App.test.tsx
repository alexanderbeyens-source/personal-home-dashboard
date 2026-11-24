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
