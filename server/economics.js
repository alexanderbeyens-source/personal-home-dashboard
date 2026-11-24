const ECB_API = "https://data-api.ecb.europa.eu/service/data";
const EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const WORLD_BANK_API = "https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.KD.ZG";
const XETRA_QUOTE_URL = "https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=IE00B3YLTY66&mic=XETR";
const XETRA_QUOTE_PAGE = "https://www.boerse-frankfurt.de/etf/ie00b3ylty66";
const SSGA_IMIE_URL = "https://www.ssga.com/uk/en_gb/intermediary/etfs/funds/spdr-msci-acwi-imi-ucits-etf-spyi-gy";

const DATA_SOURCES = [
  { key: "depositRate", label: "ECB-depositorente", ttlMs: 6 * 60 * 60 * 1000 },
  { key: "refinancingRate", label: "ECB-herfinancieringsrente", ttlMs: 6 * 60 * 60 * 1000 },
  { key: "lendingRate", label: "ECB-marginale beleningsrente", ttlMs: 6 * 60 * 60 * 1000 },
  { key: "worldGrowth", label: "Mondiale reële bbp-groei", ttlMs: 30 * 24 * 60 * 60 * 1000 },
  { key: "belgiumInflation", label: "Belgische HICP", ttlMs: 24 * 60 * 60 * 1000 },
  { key: "euroAreaInflation", label: "HICP eurozone", ttlMs: 24 * 60 * 60 * 1000 },
  { key: "mortgageRates", label: "Belgische hypotheekrente", ttlMs: 24 * 60 * 60 * 1000 },
  { key: "electricityPrices", label: "Elektriciteitsprijzen Belgische gezinnen", ttlMs: 7 * 24 * 60 * 60 * 1000 },
  { key: "gasPrices", label: "Aardgasprijzen Belgische gezinnen", ttlMs: 7 * 24 * 60 * 60 * 1000 },
  { key: "imiePrice", label: "IMIE ETF-koers", ttlMs: 6 * 60 * 60 * 1000 },
  { key: "imieQuote", label: "IMIE · Xetra-koers", ttlMs: (currentTime) => (isXetraTradingTime(currentTime) ? 60 * 1000 : 30 * 60 * 1000) },
];

const POLICY_SERIES = [
  { id: "deposit", label: "Depositorente", code: "DFR" },
  { id: "refinancing", label: "Basisherfinancieringsrente", code: "MRR_FR" },
  { id: "lending", label: "Marginale beleningsrente", code: "MLFR" },
];

const ECB_POLICY_SOURCE = "https://data.ecb.europa.eu/data/datasets/FM";
const ECB_MORTGAGE_SOURCE = "https://data.ecb.europa.eu/data/datasets/MIR";
const EUROSTAT_INFLATION_SOURCE = "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_manr/default/table?lang=en";
const EUROSTAT_ELECTRICITY_SOURCE = "https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_204/default/table?lang=en";
const EUROSTAT_GAS_SOURCE = "https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_202/default/table?lang=en";
const MONTHLY_DATA_MAX_AGE_MS = 100 * 24 * 60 * 60 * 1000;
const SEMIANNUAL_DATA_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
const DAILY_DATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ANNUAL_DATA_MAX_AGE_MS = 800 * 24 * 60 * 60 * 1000;

export function createEconomicsService({ loaders, now = () => Date.now() }) {
  const cache = new Map();
  const inFlight = new Map();

  async function loadSource(source, refresh) {
    const currentTime = now();
    const cached = cache.get(source.key);
    if (!refresh && cached && (cached.expiresAt > currentTime || cached.retryAt > currentTime)) {
      return {
        value: cached.value,
        stale: Boolean(cached.failedAt),
        fetchedAt: cached.fetchedAt,
        warning: cached.warning,
      };
    }

    if (inFlight.has(source.key)) return inFlight.get(source.key);

    let request;
    request = (async () => {
      try {
        const value = await loaders[source.key]();
        const fetchedAt = new Date(now()).toISOString();
        cache.set(source.key, {
          value,
          fetchedAt,
          expiresAt: now() + (typeof source.ttlMs === "function" ? source.ttlMs(now()) : source.ttlMs),
          retryAt: 0,
          failedAt: 0,
          warning: null,
        });
        return { value, stale: false, fetchedAt, warning: null };
      } catch (error) {
        const warning = error instanceof Error ? error.message : "Bron is tijdelijk niet beschikbaar.";
        const previous = cache.get(source.key);
        const hasPreviousValue = previous?.value !== null && previous?.value !== undefined;
        const failedAt = now();
        const fallback = hasPreviousValue
          ? {
              ...previous,
              retryAt: failedAt + 5 * 60 * 1000,
              failedAt,
              warning,
            }
          : {
              value: null,
              fetchedAt: null,
              expiresAt: 0,
              retryAt: failedAt + 5 * 60 * 1000,
              failedAt,
              warning,
            };
        cache.set(source.key, fallback);
        return {
          value: fallback.value,
          stale: hasPreviousValue,
          fetchedAt: fallback.fetchedAt,
          warning,
        };
      } finally {
        if (inFlight.get(source.key) === request) inFlight.delete(source.key);
      }
    })();
    inFlight.set(source.key, request);
    return request;
  }

  async function get({ refresh = false } = {}) {
    const results = await Promise.all(DATA_SOURCES.map(async (source) => ({
      source,
      result: await loadSource(source, refresh),
    })));
    const data = Object.fromEntries(results.map(({ source, result }) => [
      source.key,
      result.value ? { ...result.value, stale: result.stale, fetchedAt: result.fetchedAt } : null,
    ]));
    const rates = [data.depositRate, data.refinancingRate, data.lendingRate].filter(Boolean);
    data.policyRates = rates.length
      ? { rates, source: "Europese Centrale Bank", sourceUrl: ECB_POLICY_SOURCE }
      : null;
    delete data.depositRate;
    delete data.refinancingRate;
    delete data.lendingRate;
    const warnings = results
      .filter(({ result }) => result.warning)
      .map(({ source, result }) => ({
        source: source.label,
        message: result.warning,
        stale: result.stale,
      }));
    return { generatedAt: new Date(now()).toISOString(), ...data, warnings };
  }

  return { get };
}

export function createEconomicLoaders({ fetchJson, fetchText, now = () => Date.now() }) {
  const loaders = {
    belgiumInflation: () => loadInflation(fetchJson, "BE", now()),
    euroAreaInflation: () => loadInflation(fetchJson, "EA20", now()),
    worldGrowth: () => loadWorldGrowth(fetchJson, now()),
    imieQuote: () => loadImieQuote(fetchJson, now()),
    mortgageRates: () => loadMortgageRates(fetchText, now()),
    electricityPrices: () => loadEnergyPrice(fetchJson, {
      dataset: "nrg_pc_204",
      consumption: "KWH2500-4999",
      resource: "Electricity",
      sourceUrl: EUROSTAT_ELECTRICITY_SOURCE,
      currentTime: now(),
    }),
    gasPrices: () => loadEnergyPrice(fetchJson, {
      dataset: "nrg_pc_202",
      consumption: "GJ20-199",
      resource: "Natural gas",
      sourceUrl: EUROSTAT_GAS_SOURCE,
      currentTime: now(),
    }),
    imiePrice: () => loadImieMarketPrice(fetchText, now()),
  };
  for (const series of POLICY_SERIES) {
    loaders[`${series.id}Rate`] = () => loadPolicyRate(fetchText, series, now());
  }
  return loaders;
}

async function loadWorldGrowth(fetchJson, currentTime) {
  const url = `${WORLD_BANK_API}?format=json&per_page=20`;
  const payload = await fetchJson(url);
  const observations = Array.isArray(payload?.[1]) ? payload[1] : [];
  const series = observations
    .filter(({ date, value }) => /^\d{4}$/.test(String(date)) && value !== null && value !== undefined && value !== "")
    .map(({ date, value }) => ({ period: String(date), value: Number(value) }))
    .filter(({ period, value }) => /^\d{4}$/.test(period) && Number.isFinite(value))
    .sort((first, second) => first.period.localeCompare(second.period))
    .slice(-12);
  return createSeriesMetric({
    series,
    unit: "% j/j",
    frequency: "Jaarlijks · reële bbp-groei",
    source: "Wereldbank · World Development Indicators",
    sourceUrl: "https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=1W",
    sourceUpdatedAt: payload?.[0]?.lastupdated ?? null,
    maxObservationAgeMs: ANNUAL_DATA_MAX_AGE_MS,
    currentTime,
  });
}

async function loadPolicyRate(fetchText, series, currentTime) {
  const startDate = new Date(currentTime);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 7);
  const start = startDate.toISOString().slice(0, 10);
  const url = `${ECB_API}/FM/D.U2.EUR.4F.KR.${series.code}.LEV?format=csvdata&startPeriod=${start}`;
  const rows = parseEcbCsv(await fetchText(url))
    .filter(({ TIME_PERIOD, OBS_VALUE }) =>
      /^\d{4}-\d{2}-\d{2}$/.test(TIME_PERIOD) && OBS_VALUE !== "",
    )
    .map(({ TIME_PERIOD, OBS_VALUE }) => ({
      date: TIME_PERIOD,
      value: Number(OBS_VALUE),
    }))
    .filter(({ value }) => Number.isFinite(value));
  if (!rows.length) throw new Error("ECB returned no usable policy-rate observations.");
  const latest = rows.at(-1);
  const lastChange = rows.findLast((observation, index) =>
    index > 0 && observation.value !== rows[index - 1].value,
  );
  const historyStart = new Date(currentTime - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    id: series.id,
    label: series.label,
    value: latest.value,
    unit: "%",
    period: latest.date,
    lastChangeDate: lastChange?.date ?? null,
    frequency: "Dagelijks",
    history: rows
      .filter((item) => item.date >= historyStart)
      .map(({ date, value }) => ({ period: date, value })),
    source: "Europese Centrale Bank",
    sourceUrl: ECB_POLICY_SOURCE,
    observationStale: isObservationStale(latest.date, DAILY_DATA_MAX_AGE_MS, currentTime),
  };
}

async function loadInflation(fetchJson, geography, currentTime) {
  const url = `${EUROSTAT_API}/prc_hicp_manr?freq=M&unit=RCH_A&coicop=CP00&geo=${geography}&lang=en`;
  const payload = await fetchJson(url);
  const series = eurostatTimeSeries(payload, 13);
  return createSeriesMetric({
    series,
    unit: "% j/j",
    frequency: "Maandelijks · jaarlijkse wijziging",
    source: "Eurostat · HICP",
    sourceUrl: EUROSTAT_INFLATION_SOURCE,
    sourceUpdatedAt: payload.updated ?? null,
    maxObservationAgeMs: MONTHLY_DATA_MAX_AGE_MS,
    currentTime,
  });
}

async function loadMortgageRates(fetchText, currentTime) {
  const start = new Date(currentTime);
  start.setUTCMonth(start.getUTCMonth() - 13);
  const startPeriod = start.toISOString().slice(0, 7);
  const url = `${ECB_API}/MIR/M.BE.B.A2C.A.R.A.2250.EUR.N?format=csvdata&startPeriod=${startPeriod}`;
  const series = parseEcbCsv(await fetchText(url))
    .filter(({ TIME_PERIOD, OBS_VALUE }) =>
      /^\d{4}-\d{2}$/.test(TIME_PERIOD) && OBS_VALUE !== "",
    )
    .map(({ TIME_PERIOD, OBS_VALUE }) => ({ period: TIME_PERIOD, value: Number(OBS_VALUE) }))
    .filter(({ value }) => Number.isFinite(value))
    .slice(-13);
  if (!series.length) throw new Error("ECB returned no usable Belgian mortgage-rate observations.");
  return createSeriesMetric({
    series,
    unit: "%",
    frequency: "Maandelijks · nieuwe woonkredieten, alle initiële rentevasteperiodes",
    source: "Europese Centrale Bank · MIR",
    sourceUrl: ECB_MORTGAGE_SOURCE,
    disclaimer: "Historisch gemiddelde voor nieuwe woonkredieten; geen persoonlijke bankofferte.",
    maxObservationAgeMs: MONTHLY_DATA_MAX_AGE_MS,
    currentTime,
  });
}

async function loadEnergyPrice(fetchJson, {
  dataset,
  consumption,
  resource,
  sourceUrl,
  currentTime,
}) {
  const params = new URLSearchParams({
    freq: "S",
    siec: resource === "Electricity" ? "E7000" : "G3000",
    nrg_cons: consumption,
    unit: "KWH",
    tax: "I_TAX",
    currency: "EUR",
    geo: "BE",
    lang: "en",
  });
  const payload = await fetchJson(`${EUROSTAT_API}/${dataset}?${params}`);
  const series = eurostatTimeSeries(payload, 12);
  return createSeriesMetric({
    series,
    unit: "EUR/kWh",
    frequency: "Halfjaarlijks · prijs voor gezinnen, alle belastingen en heffingen inbegrepen",
    source: `Eurostat · Belgische consumentenprijs ${resource === "Electricity" ? "elektriciteit" : "aardgas"}`,
    sourceUrl,
    sourceUpdatedAt: payload.updated ?? null,
    maxObservationAgeMs: SEMIANNUAL_DATA_MAX_AGE_MS,
    currentTime,
    consumptionBand: consumption === "KWH2500-4999"
      ? "verbruiksklasse 2.500-4.999 kWh/jaar"
      : "verbruiksklasse 20-199 GJ/jaar",
  });
}

export function isXetraTradingTime(currentTime) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(currentTime)).map(({ type, value }) => [type, value]));
  if (["Sat", "Sun"].includes(parts.weekday)) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 && minutes <= 17 * 60 + 35;
}

async function loadImieQuote(fetchJson, currentTime) {
  const payload = await fetchJson(XETRA_QUOTE_URL);
  const value = Number(payload?.lastPrice);
  const timestamp = new Date(payload?.timestampLastPrice ?? "");
  if (!Number.isFinite(value) || value <= 0 || Number.isNaN(timestamp.getTime())) {
    throw new Error("Xetra-koers ongeldig of onvolledig.");
  }
  if (payload.isin && payload.isin !== "IE00B3YLTY66") throw new Error("Xetra-koers hoort bij een ander fonds.");
  const finiteOrNull = (input) => (input === null || input === undefined || !Number.isFinite(Number(input)) ? null : Number(input));
  return {
    value,
    unit: payload.currency?.originalValue ?? "EUR",
    priceType: "Laatste Xetra-koers, tot 15 minuten vertraagd",
    period: timestamp.toISOString(),
    frequency: "Intraday · vertraagd",
    venue: "Xetra",
    ticker: "SPYI",
    isin: "IE00B3YLTY66",
    previousClose: finiteOrNull(payload.closingPricePrevTradingDay),
    changePercent: finiteOrNull(payload.changeToPrevDayInPercent),
    dayLow: finiteOrNull(payload.dayLow),
    dayHigh: finiteOrNull(payload.dayHigh),
    tradingOpen: isXetraTradingTime(currentTime),
    source: "Deutsche Börse · Xetra",
    sourceUrl: XETRA_QUOTE_PAGE,
    observationStale: currentTime - timestamp.getTime() > 4 * 24 * 60 * 60 * 1000,
  };
}

async function loadImieMarketPrice(fetchText, currentTime) {
  const html = await fetchText(SSGA_IMIE_URL);
  if (html.length > 1_000_000) throw new Error("IMIE issuer page exceeded the size limit.");
  const section = html.match(
    /<section\b[^>]*>\s*<h2\b[^>]*>\s*Fund Market Price\s*<span\b[^>]*>as of\s*([^<]+)<\/span>([\s\S]*?)<\/section>/i,
  );
  if (!section) throw new Error("The IMIE issuer page did not contain its market-price section.");
  const closingPriceRow = section[2].match(
    /<tr\b[^>]*>\s*<th\b[^>]*>\s*Closing Price\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/i,
  );
  if (!closingPriceRow) throw new Error("The IMIE issuer page did not contain a closing price.");
  const valueText = stripHtml(closingPriceRow[1]).replace(/,/g, "");
  const value = Number(valueText.match(/-?\d+(?:\.\d+)?/)?.[0]);
  const date = new Date(section[1].trim());
  if (!Number.isFinite(value) || Number.isNaN(date.getTime())) {
    throw new Error("The IMIE issuer page returned an invalid price or date.");
  }
  return {
    value,
    unit: "EUR",
    priceType: "Officiële slotkoers van de uitgever",
    period: date.toISOString().slice(0, 10),
    frequency: "Dagelijks · slotkoers",
    source: "State Street Global Advisors · SPDR",
    sourceUrl: SSGA_IMIE_URL,
    observationStale: isObservationStale(date.toISOString().slice(0, 10), DAILY_DATA_MAX_AGE_MS, currentTime),
  };
}

function createSeriesMetric({
  series,
  unit,
  frequency,
  source,
  sourceUrl,
  sourceUpdatedAt,
  maxObservationAgeMs,
  currentTime = Date.now(),
  disclaimer,
  consumptionBand,
}) {
  if (!series.length) throw new Error(`${source} returned no usable observations.`);
  const observations = [...series].sort((a, b) => a.period.localeCompare(b.period));
  const latest = observations.at(-1);
  const previous = observations.at(-2) ?? null;
  return {
    value: latest.value,
    unit,
    period: latest.period,
    previousValue: previous?.value ?? null,
    change: previous ? round(latest.value - previous.value, 5) : null,
    history: observations,
    frequency,
    source,
    sourceUrl,
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    observationStale: maxObservationAgeMs
      ? isObservationStale(latest.period, maxObservationAgeMs, currentTime)
      : false,
    ...(disclaimer ? { disclaimer } : {}),
    ...(consumptionBand ? { consumptionBand } : {}),
  };
}

function isObservationStale(period, maxAgeMs, currentTime) {
  const timestamp = periodTimestamp(period);
  return !Number.isFinite(timestamp) || currentTime - timestamp > maxAgeMs;
}

function periodTimestamp(period) {
  const semester = period.match(/^(\d{4})-S([12])$/);
  if (semester) return Date.UTC(Number(semester[1]), semester[2] === "1" ? 0 : 6, 1);
  if (/^\d{4}-\d{2}$/.test(period)) return Date.parse(`${period}-01T00:00:00Z`);
  return Date.parse(period);
}

function eurostatTimeSeries(payload, limit) {
  const times = payload?.dimension?.time?.category?.index;
  const values = payload?.value;
  if (!times || !values || typeof values !== "object") {
    throw new Error("Eurostat returned an unexpected time-series response.");
  }
  const indexToPeriod = Object.entries(times).map(([period, index]) => [index, period]);
  const series = indexToPeriod
    .map(([index, period]) => {
      const value = values[index];
      return {
        period,
        value: value === null || value === undefined || value === "" ? Number.NaN : Number(value),
      };
    })
    .filter(({ period, value }) => typeof period === "string" && Number.isFinite(value))
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-limit);
  if (!series.length) throw new Error("Eurostat returned no usable observations.");
  return series;
}

function parseEcbCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("ECB returned an empty CSV dataset.");
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function stripHtml(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&euro;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
