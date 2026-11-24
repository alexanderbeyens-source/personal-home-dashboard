import { readFirstSheet } from "./xlsx.js";

export const IMIE_ISIN = "IE00B3YLTY66";
export const SSGA_NAV_HISTORY_URL = "https://www.ssga.com/library-content/products/fund-data/etfs/emea/navhist-emea-en-spyi-gy.xlsx";
export const SSGA_FUND_PAGE = "https://www.ssga.com/ie/en_gb/institutional/etfs/state-street-spdr-msci-all-country-world-investable-market-ucits-etf-acc-spyi-gy";
export const XETRA_TICKS_URL = `https://api.boerse-frankfurt.de/v1/data/tick_data?isin=${IMIE_ISIN}&mic=XETR&limit=10000`;
export const XETRA_PAGE = "https://www.boerse-frankfurt.de/etf/ie00b3ylty66";
export const IMIE_RANGES = ["1d", "5d", "1m", "3m", "6m", "ytd", "1y", "3y", "5y", "10y"];

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const MAX_POINTS = 260;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseNavDate(value) {
  const text = String(value).trim();
  const named = text.match(/^(\d{1,2})-([A-Z][a-z]{2})-(\d{4})$/);
  if (named && MONTHS[named[2]] !== undefined) {
    return new Date(Date.UTC(Number(named[3]), MONTHS[named[2]], Number(named[1]))).toISOString().slice(0, 10);
  }
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    // Excel serial date (1900 system).
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * DAY_MS).toISOString().slice(0, 10);
  }
  return null;
}

// Parses the issuer's NAV history sheet into ascending { date, nav, shares } points
// and adjusts earlier values for share splits so the series is continuous.
export function parseNavHistory(rows) {
  const meta = Object.fromEntries(rows.slice(0, 10).filter((row) => row[0]?.endsWith(":")).map((row) => [row[0].slice(0, -1), row[1]]));
  if (meta.ISIN && meta.ISIN !== IMIE_ISIN) throw new Error("NAV-historiek hoort bij een ander fonds.");
  const currency = meta["NAV Currency"] ?? "USD";
  const points = [];
  for (const row of rows) {
    const date = parseNavDate(row[0] ?? "");
    const nav = Number(row[1]);
    if (!date || !Number.isFinite(nav) || nav <= 0) continue;
    const shares = Number(row[2]);
    points.push({ date, nav, shares: Number.isFinite(shares) && shares > 0 ? shares : null });
  }
  if (points.length < 10) throw new Error("NAV-historiek is leeg of onvolledig.");
  points.sort((first, second) => first.date.localeCompare(second.date));
  const unique = points.filter((point, index) => index === 0 || point.date !== points[index - 1].date);

  const splits = [];
  let factor = 1;
  const adjusted = new Array(unique.length);
  for (let index = unique.length - 1; index >= 0; index--) {
    const point = unique[index];
    const next = unique[index + 1];
    if (next) {
      const priceRatio = point.nav / next.nav;
      if (priceRatio > 2 || priceRatio < 0.5) {
        const sharesRatio = point.shares && next.shares ? next.shares / point.shares : null;
        const candidate = sharesRatio && Math.abs(sharesRatio - Math.round(sharesRatio)) < 0.05 ? Math.round(sharesRatio) : null;
        const split = candidate && Math.abs(candidate / priceRatio - 1) < 0.15 ? candidate : Math.round(priceRatio);
        if (split >= 2) {
          factor *= split;
          splits.push({ date: next.date, ratio: split });
        } else if (priceRatio < 0.5) {
          const reverse = Math.round(1 / priceRatio);
          factor /= reverse;
          splits.push({ date: next.date, ratio: 1 / reverse });
        }
      }
    }
    adjusted[index] = { date: point.date, nav: point.nav / factor };
  }
  return { currency, points: adjusted, splits };
}

// EUR/USD from the ECB via Frankfurter: { "YYYY-MM-DD": usdPerEur }.
export function parseEurUsdSeries(payload) {
  const rates = {};
  for (const [date, value] of Object.entries(payload?.rates ?? {})) {
    const usd = Number(value?.USD);
    if (Number.isFinite(usd) && usd > 0) rates[date] = usd;
  }
  if (Object.keys(rates).length === 0) throw new Error("Wisselkoersreeks is leeg.");
  return rates;
}

// Converts USD NAV points to EUR with the ECB rate of the same day or the latest earlier day.
export function convertToEur(points, rates) {
  const dates = Object.keys(rates).sort();
  let pointer = 0;
  const result = [];
  for (const point of points) {
    while (pointer + 1 < dates.length && dates[pointer + 1] <= point.date) pointer++;
    if (dates[pointer] > point.date) continue;
    result.push({ t: point.date, v: point.nav / rates[dates[pointer]] });
  }
  return result;
}

export function rangeStart(range, latestDate) {
  const end = new Date(`${latestDate}T00:00:00Z`);
  const shift = (months, years = 0) => {
    const date = new Date(end);
    date.setUTCFullYear(date.getUTCFullYear() - years, date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
  };
  switch (range) {
    case "1m": return shift(1);
    case "3m": return shift(3);
    case "6m": return shift(6);
    case "ytd": return `${end.getUTCFullYear()}-01-01`;
    case "1y": return shift(0, 1);
    case "3y": return shift(0, 3);
    case "5y": return shift(0, 5);
    case "10y": return shift(0, 10);
    default: return null;
  }
}

// Daily points for a range; the baseline is the last point on or before the start
// (for YTD: the last close of the previous year), so the change is measured correctly.
export function sliceDaily(points, range) {
  if (!points.length) return [];
  if (range === "5d") return points.slice(-6);
  const start = rangeStart(range, points.at(-1).t);
  const firstInside = points.findIndex((point) => (range === "ytd" ? point.t >= start : point.t > start));
  if (firstInside < 0) return points.slice(-1);
  return points.slice(Math.max(0, firstInside - 1));
}

export function downsample(points, maximum = MAX_POINTS) {
  if (points.length <= maximum) return points;
  const step = (points.length - 1) / (maximum - 1);
  const result = [];
  for (let index = 0; index < maximum; index++) result.push(points[Math.round(index * step)]);
  return result;
}

const berlinDate = (time) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));

// Xetra trades (newest first, may span several sessions) to 5-minute points for the
// latest session only, plus the last trade of the session before as the baseline.
export function latestSession(payload, bucketMinutes = 5) {
  const ticks = (Array.isArray(payload?.ticks) ? payload.ticks : [])
    .map((tick) => ({ price: Number(tick?.price), time: Date.parse(tick?.time ?? "") }))
    .filter((tick) => Number.isFinite(tick.price) && tick.price > 0 && !Number.isNaN(tick.time));
  if (!ticks.length) return { session: null, points: [], previousClose: null };
  const latest = Math.max(...ticks.map((tick) => tick.time));
  const session = berlinDate(latest);
  const before = ticks.filter((tick) => berlinDate(tick.time) < session);
  const previous = before.length ? before.reduce((last, tick) => (tick.time > last.time ? tick : last)) : null;
  const points = intradayPoints({ ticks: ticks.filter((tick) => berlinDate(tick.time) === session).map((tick) => ({ price: tick.price, time: new Date(tick.time).toISOString() })) }, bucketMinutes);
  return { session, points, previousClose: previous?.price ?? null };
}

// Xetra trades to 5-minute points: the last price per bucket.
export function intradayPoints(payload, bucketMinutes = 5) {
  const ticks = Array.isArray(payload?.ticks) ? payload.ticks : [];
  const buckets = new Map();
  for (const tick of ticks) {
    const price = Number(tick?.price);
    const time = Date.parse(tick?.time ?? "");
    if (!Number.isFinite(price) || price <= 0 || Number.isNaN(time)) continue;
    const bucket = Math.floor(time / (bucketMinutes * 60 * 1000)) * bucketMinutes * 60 * 1000;
    const existing = buckets.get(bucket);
    if (!existing || time > existing.time) buckets.set(bucket, { time, price });
  }
  return [...buckets.entries()]
    .sort(([first], [second]) => first - second)
    .map(([, { time, price }]) => ({ t: new Date(time).toISOString(), v: price }));
}

function changePercent(points) {
  if (points.length < 2) return null;
  return ((points.at(-1).v - points[0].v) / points[0].v) * 100;
}

export function createImieHistoryService({ fetchJson, fetchBuffer, now = () => Date.now(), isTradingTime = () => false }) {
  const cache = new Map();
  const inFlight = new Map();

  async function cached(key, ttlMs, load) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now()) return { value: entry.value, stale: entry.stale };
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = (async () => {
      try {
        const value = await load();
        cache.set(key, { value, expiresAt: now() + ttlMs, stale: false });
        return { value, stale: false };
      } catch (error) {
        if (entry) {
          cache.set(key, { ...entry, expiresAt: now() + 60 * 1000, stale: true });
          return { value: entry.value, stale: true };
        }
        throw error;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, promise);
    return promise;
  }

  const loadNav = () => cached("nav", 6 * 60 * 60 * 1000, async () => parseNavHistory(readFirstSheet(await fetchBuffer(SSGA_NAV_HISTORY_URL))));

  const loadRates = (fromDate) => cached(`fx:${fromDate}`, 6 * 60 * 60 * 1000, async () => {
    const to = new Date(now()).toISOString().slice(0, 10);
    return parseEurUsdSeries(await fetchJson(`https://api.frankfurter.dev/v1/${fromDate}..${to}?symbols=USD`));
  });

  const loadIntraday = () => cached("intraday", isTradingTime(now()) ? 60 * 1000 : 30 * 60 * 1000, async () => latestSession(await fetchJson(XETRA_TICKS_URL)));

  async function get(range) {
    if (!IMIE_RANGES.includes(range)) {
      const error = new Error("Onbekende periode.");
      error.status = 400;
      throw error;
    }
    if (range === "1d") {
      const { value: { session, points, previousClose }, stale } = await loadIntraday();
      const today = berlinDate(now());
      const baseline = previousClose ?? points[0]?.v ?? null;
      return {
        range,
        basis: "xetra-intraday",
        currency: "EUR",
        points,
        session,
        previousClose,
        changePercent: points.length && baseline ? ((points.at(-1).v - baseline) / baseline) * 100 : null,
        from: points[0]?.t ?? null,
        to: points.at(-1)?.t ?? null,
        source: "Deutsche Börse · Xetra",
        sourceUrl: XETRA_PAGE,
        note: !points.length
          ? "Geen recente handel op Xetra gevonden."
          : session === today
            ? "Laatste koers per 5 minuten op Xetra, tot 15 minuten vertraagd. Rendement t.o.v. de vorige slotkoers."
            : "Vandaag nog geen handel op Xetra; de laatste handelsdag wordt getoond.",
        stale,
        splits: [],
      };
    }
    const { value: nav, stale: navStale } = await loadNav();
    // Fetch exchange rates from the start of the range's year (cached), with a margin.
    const latest = nav.points.at(-1).date;
    const start = range === "5d" ? nav.points.at(-8)?.date ?? latest : rangeStart(range, latest);
    const fxFrom = `${Number(start.slice(0, 4)) - (start.slice(5) <= "01-10" ? 1 : 0)}-01-01`;
    const { value: rates, stale: fxStale } = await loadRates(fxFrom < "1999-01-04" ? "1999-01-04" : fxFrom);
    const daily = convertToEur(nav.points.filter((point) => point.date >= fxFrom), rates);
    const sliced = sliceDaily(daily, range);
    const points = downsample(sliced);
    return {
      range,
      basis: "nav-eur",
      currency: "EUR",
      points,
      changePercent: changePercent(sliced),
      from: sliced[0]?.t ?? null,
      to: sliced.at(-1)?.t ?? null,
      source: "State Street SPDR (NAV) · ECB (EUR/USD)",
      sourceUrl: SSGA_FUND_PAGE,
      note: "Officiële dagelijkse NAV in USD, omgerekend naar EUR met de ECB-referentiekoers. Gecorrigeerd voor aandelensplitsingen.",
      stale: navStale || fxStale,
      splits: nav.splits.filter((split) => split.date >= (sliced[0]?.t ?? latest)),
    };
  }

  return { get };
}
