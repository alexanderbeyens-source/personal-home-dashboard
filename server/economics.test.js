import { describe, expect, it, vi } from "vitest";
import { createEconomicLoaders, createEconomicsService } from "./economics.js";

const now = Date.parse("2026-11-23T12:00:00.000Z");

function csv(rows) {
  return [
    "KEY,TIME_PERIOD,OBS_VALUE,TITLE",
    ...rows.map(([period, value]) => `series,${period},${value},"A quoted, official series"`),
  ].join("\n");
}

function eurostatPayload(values) {
  const periods = Object.keys(values);
  return {
    dimension: {
      time: { category: { index: Object.fromEntries(periods.map((period, index) => [period, index])) } },
    },
    value: Object.fromEntries(periods.map((period, index) => [index, values[period]])),
  };
}

describe("official economic data loaders", () => {
  it("parses ECB policy rates and reports their latest effective change dates", async () => {
    const fetchText = vi.fn(async (url) => {
      if (url.includes("DFR")) return csv([["2025-11-01", 3.25], ["2026-02-01", 2.75]]);
      if (url.includes("MRR_FR")) return csv([["2025-11-01", 3.4], ["2026-02-01", 2.9]]);
      return csv([["2025-11-01", 3.65], ["2026-02-01", 3.15]]);
    });
    const loaders = createEconomicLoaders({ fetchText, fetchJson: vi.fn(), now: () => now });
    const [deposit, refinancing, lending] = await Promise.all([
      loaders.depositRate(),
      loaders.refinancingRate(),
      loaders.lendingRate(),
    ]);

    expect(deposit).toMatchObject({
      value: 2.75,
      period: "2026-02-01",
      lastChangeDate: "2026-02-01",
      source: "Europese Centrale Bank",
    });
    expect(refinancing.value).toBe(2.9);
    expect(lending.value).toBe(3.15);
    expect(fetchText).toHaveBeenCalledTimes(3);
    expect(fetchText.mock.calls[0][0]).toContain("format=csvdata");
  });

  it("requests official HICP, mortgage, and representative consumer energy series", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("api.worldbank.org")) {
        return [
          { lastupdated: "2026-11-11" },
          [{ date: "2025", value: 2.9 }, { date: "2024", value: 2.8 }],
        ];
      }
      if (url.includes("prc_hicp_manr")) {
        return eurostatPayload({ "2025-10": 2.1, "2025-11": 2.4, "2025-12": 2.6 });
      }
      if (url.includes("nrg_pc_204")) {
        return eurostatPayload({ "2025-S1": 0.34, "2025-S2": 0.35, "2026-S1": 0.36 });
      }
      return eurostatPayload({ "2025-S1": 0.08, "2025-S2": 0.09, "2026-S1": 0.085 });
    });
    const fetchText = vi.fn(async () => csv([
      ["2025-10", 3.2],
      ["2025-11", 3.3],
      ["2025-12", 3.4],
    ]));
    const loaders = createEconomicLoaders({ fetchJson, fetchText, now: () => now });
    const [worldGrowth, belgium, euroArea, mortgage, electricity, gas] = await Promise.all([
      loaders.worldGrowth(),
      loaders.belgiumInflation(),
      loaders.euroAreaInflation(),
      loaders.mortgageRates(),
      loaders.electricityPrices(),
      loaders.gasPrices(),
    ]);

    expect(worldGrowth).toMatchObject({
      value: 2.9,
      period: "2025",
      unit: "% j/j",
      source: "Wereldbank · World Development Indicators",
      sourceUpdatedAt: "2026-11-11",
    });
    expect(belgium).toMatchObject({
      value: 2.6,
      period: "2025-12",
      change: 0.2,
      unit: "% j/j",
      source: "Eurostat · HICP",
      observationStale: true,
    });
    expect(euroArea.value).toBe(2.6);
    expect(mortgage).toMatchObject({
      value: 3.4,
      unit: "%",
      disclaimer: expect.stringContaining("geen persoonlijke bankofferte"),
    });
    expect(electricity).toMatchObject({
      value: 0.36,
      unit: "EUR/kWh",
      consumptionBand: "verbruiksklasse 2.500-4.999 kWh/jaar",
    });
    expect(gas.value).toBe(0.085);
    expect(fetchJson.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      expect.stringContaining("geo=BE"),
      expect.stringContaining("geo=EA20"),
      expect.stringContaining("nrg_cons=KWH2500-4999"),
      expect.stringContaining("nrg_cons=GJ20-199"),
    ]));
  });

  it("parses the ETF's official issuer closing price and observation date", async () => {
    const html = `<section><h2 class="comp-title"> Fund Market Price <span class="date">as of 20 Nov 2026</span></h2>
      <div class="section-content"><table><tbody><tr><th>Closing Price</th><td>€10.97</td></tr></tbody></table></div></section>`;
    const loaders = createEconomicLoaders({
      fetchText: vi.fn(async () => html),
      fetchJson: vi.fn(),
      now: () => now,
    });

    await expect(loaders.imiePrice()).resolves.toMatchObject({
      value: 10.97,
      unit: "EUR",
      period: "2026-11-20",
      priceType: "Officiële slotkoers van de uitgever",
      source: "State Street Global Advisors · SPDR",
    });
  });
});

describe("economic source cache", () => {
  it("isolates source failures, retains prior observations, and marks them stale", async () => {
    const keys = [
      "depositRate",
      "refinancingRate",
      "lendingRate",
      "worldGrowth",
      "belgiumInflation",
      "euroAreaInflation",
      "mortgageRates",
      "electricityPrices",
      "gasPrices",
      "imiePrice",
    ];
    const loaders = Object.fromEntries(keys.map((key) => [key, vi.fn(async () => ({ key, value: 1 }))]));
    const service = createEconomicsService({ loaders, now: () => now });
    const first = await service.get();
    await service.get();
    expect(loaders.belgiumInflation).toHaveBeenCalledTimes(1);
    loaders.belgiumInflation.mockRejectedValue(new Error("Eurostat unavailable"));
    const refreshed = await service.get({ refresh: true });
    const cachedFailure = await service.get();

    expect(first.belgiumInflation).toMatchObject({ value: 1, stale: false });
    expect(refreshed.belgiumInflation).toMatchObject({ value: 1, stale: true });
    expect(cachedFailure.belgiumInflation).toMatchObject({ value: 1, stale: true });
    expect(loaders.belgiumInflation).toHaveBeenCalledTimes(2);
    expect(refreshed.warnings).toContainEqual({
      source: "Belgische HICP",
      message: "Eurostat unavailable",
      stale: true,
    });
    expect(refreshed.policyRates.rates).toHaveLength(3);
    expect(refreshed.gasPrices.stale).toBe(false);
  });
});
