import { describe, expect, it, vi } from "vitest";
import { composeDailyBriefing, createDailyBriefingService } from "./briefing.js";

const now = Date.parse("2026-11-23T12:00:00.000Z");

function article(category, index, overrides = {}) {
  const link = `https://example.com/${category}/${index}`;
  const titles = {
    belgium: [
      "Belgian parliament approves a new housing proposal",
      "Brussels mobility policy divides coalition parties",
    ],
    international: [
      "Pacific climate talks produce a regional accord",
      "Ceasefire negotiations resume after border incident",
    ],
    "technology-ai": [
      "Researchers release a new machine learning benchmark",
      "Chipmakers announce next-generation processor designs",
    ],
    "economy-business": [
      "European inflation data updates market outlook",
      "Energy firms revise investment plans for winter",
    ],
    sport: [
      "Lakers win after a late fourth-quarter comeback",
      "Toumani Camara leads Portland scoring in close game",
    ],
  };
  return {
    id: link,
    title: titles[category]?.[index] ?? `${category} story ${index}`,
    link,
    sourceId: `${category}-source`,
    source: "Example News",
    sourceKind: "journalism",
    category,
    language: "en",
    publishedAt: new Date(now - index * 60 * 60 * 1000).toISOString(),
    description: `Source-provided summary for ${category} development ${index}.`,
    coverage: [],
    feedPosition: index,
    ...overrides,
  };
}

function newsByCategory() {
  return Object.fromEntries([
    "belgium",
    "international",
    "technology-ai",
    "economy-business",
    "sport",
  ].map((category) => [
    category,
    { articles: [article(category, 0), article(category, 1)], warnings: [] },
  ]));
}

describe("daily briefing composition", () => {
  it("selects at most five balanced top stories and keeps summaries tied to sources", () => {
    const briefing = composeDailyBriefing({
      newsByCategory: newsByCategory(),
      warnings: [],
    }, now);

    expect(briefing.topStories).toHaveLength(5);
    expect(new Set(briefing.topStories.map(({ category }) => category)).size).toBe(5);
    expect(briefing.topStories[0]).toMatchObject({
      summary: expect.stringContaining("Source-provided summary"),
      whySelected: expect.stringContaining("categoriebalans"),
      link: expect.stringMatching(/^https:\/\/example\.com\//),
    });
    expect(briefing.sections.technology).toHaveLength(1);
    expect(briefing.economy.stories).toHaveLength(1);
  });

  it("excludes French and unknown-language Belgian items without filling with unrelated stories", () => {
    const briefing = composeDailyBriefing({
      newsByCategory: {
        belgium: {
          articles: [
            article("belgium", 0, { language: "fr" }),
            article("belgium", 1, { language: "unknown" }),
            article("belgium", 2, { language: "nl" }),
          ],
          warnings: [],
        },
      },
    }, now);

    expect(briefing.topStories).toHaveLength(1);
    expect(briefing.topStories[0].language).toBe("nl");
  });

  it("keeps sports scores, reports, official reference rates, agenda, and weather distinct", () => {
    const event = {
      id: "nba-1",
      name: "Portland Trail Blazers at Los Angeles Lakers",
      date: new Date(now).toISOString(),
      state: "post",
      status: "Final",
      shortStatus: "Final",
      competitors: [
        { name: "Portland Trail Blazers", abbreviation: "POR", score: "102", homeAway: "away", logo: null, winner: false },
        { name: "Los Angeles Lakers", abbreviation: "LAL", score: "110", homeAway: "home", logo: null, winner: true },
      ],
    };
    const briefing = composeDailyBriefing({
      newsByCategory: {},
      nba: { events: [event], news: [article("sport", 0)] },
      premierLeague: { events: [], news: [] },
      belgianFootball: { events: [], news: [article("sport", 1, { sportGroup: "red-devils" })] },
      finance: { base: "EUR", date: "2026-11-23", rates: { USD: 1.15 } },
      agenda: { events: [{ title: "Team meeting", start: new Date(now).toISOString(), location: "Office" }] },
      agendaConfigured: true,
      weather: {
        location: "Diest",
        temperature: 8,
        apparentTemperature: 6,
        humidity: 80,
        windSpeed: 12,
        weatherCode: 3,
        isDay: true,
      },
    }, now);

    expect(briefing.sports.nba.matches[0]).toMatchObject({ label: "Uitslag", source: "ESPN" });
    expect(briefing.sports.belgianFootball[0].sportGroup).toBe("red-devils");
    expect(briefing.economy.referenceRates.rates.USD).toBe(1.15);
    expect(briefing.today.agendaStatus).toBe("available");
    expect(briefing.today.agendaEvents[0].title).toBe("Team meeting");
    expect(briefing.today.weather.location).toBe("Diest");
  });

  it("adds at most two significant official economic indicator developments", () => {
    const briefing = composeDailyBriefing({
      newsByCategory: {},
      economics: {
        policyRates: {
          sourceUrl: "https://data.ecb.europa.eu/data/datasets/FM",
          rates: [
            { id: "deposit", label: "Depositorente", value: 2.5, lastChangeDate: "2026-11-18" },
            { id: "refinancing", label: "Basisherfinancieringsrente", value: 2.65, lastChangeDate: "2026-11-18" },
            { id: "lending", label: "Marginale beleningsrente", value: 2.9, lastChangeDate: "2026-11-18" },
          ],
        },
        belgiumInflation: {
          value: 2.6,
          change: 0.6,
          period: "2026-10",
          source: "Eurostat · HICP",
          sourceUrl: "https://ec.europa.eu/eurostat/",
          stale: false,
        },
        mortgageRates: { value: 3.7, change: 0.1, stale: false },
        electricityPrices: { value: 0.28, previousValue: 0.27, stale: false },
        gasPrices: { value: 0.08, previousValue: 0.08, stale: false },
      },
    }, now);

    expect(briefing.economy.indicatorDevelopments).toHaveLength(2);
    expect(briefing.economy.indicatorDevelopments[0].title).toContain("ECB");
    expect(briefing.economy.indicatorDevelopments[1]).toMatchObject({
      title: "Belgische HICP opvallend gewijzigd",
      source: "Eurostat · HICP",
    });
  });

  it("reports unconfigured agenda and unavailable data without inventing entries", () => {
    const briefing = composeDailyBriefing({
      newsByCategory: {},
      agendaConfigured: false,
      warnings: [{ source: "Weer · Open-Meteo", message: "Unavailable", stale: false }],
    }, now);

    expect(briefing.today).toMatchObject({
      agendaStatus: "not-configured",
      agendaEvents: [],
      weather: null,
    });
    expect(briefing.warnings).toEqual([
      { source: "Weer · Open-Meteo", message: "Unavailable", stale: false },
    ]);
  });
});

describe("daily briefing cache", () => {
  it("reuses generated data until expiry and supports explicit refresh", async () => {
    let currentTime = now;
    let generation = 0;
    const loadInputs = vi.fn(async () => {
      generation += 1;
      return { newsByCategory: {}, generation };
    });
    const service = createDailyBriefingService({
      loadInputs,
      now: () => currentTime,
      ttlMs: 60_000,
    });

    const first = await service.get();
    const cached = await service.get();
    expect(cached).toBe(first);
    expect(loadInputs).toHaveBeenCalledTimes(1);

    await service.get({ refresh: true });
    expect(loadInputs).toHaveBeenCalledTimes(2);
    currentTime += 60_001;
    const expired = await service.get();
    expect(loadInputs).toHaveBeenCalledTimes(3);
    expect(expired.generatedAt).toBe(new Date(currentTime).toISOString());
  });

  it("returns the previous briefing with a warning if a refresh fails", async () => {
    const loadInputs = vi.fn()
      .mockResolvedValueOnce({ newsByCategory: {} })
      .mockRejectedValueOnce(new Error("network unavailable"));
    const service = createDailyBriefingService({ loadInputs, now: () => now });
    const first = await service.get();
    const stale = await service.get({ refresh: true });

    expect(stale.generatedAt).toBe(first.generatedAt);
    expect(stale.stale).toBe(true);
    expect(stale.warnings.at(-1)).toMatchObject({
      source: "Dagelijkse briefing",
      stale: true,
    });
  });

  it("keeps the last successful source data when only that source fails to refresh", async () => {
    const weather = {
      location: "Diest",
      temperature: 8,
      apparentTemperature: 6,
      humidity: 80,
      windSpeed: 12,
      weatherCode: 3,
      isDay: true,
    };
    const loadInputs = vi.fn()
      .mockResolvedValueOnce({ newsByCategory: {}, weather, agendaConfigured: false })
      .mockResolvedValueOnce({
        newsByCategory: {},
        agendaConfigured: false,
        warnings: [{ source: "Weer · Open-Meteo", message: "Unavailable", stale: false }],
      });
    const service = createDailyBriefingService({ loadInputs, now: () => now });
    await service.get();
    const refreshed = await service.get({ refresh: true });

    expect(refreshed.today.weather).toEqual(weather);
    expect(refreshed.warnings).toContainEqual({
      source: "Weer · Open-Meteo",
      message: "Unavailable",
      stale: true,
    });
  });
});
