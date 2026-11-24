import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  convertToEur,
  createImieHistoryService,
  downsample,
  intradayPoints,
  latestSession,
  parseNavHistory,
  rangeStart,
  sliceDaily,
} from "./imie-history.js";
import { readFirstSheet } from "./xlsx.js";

// Builds a minimal valid .xlsx (zip) with shared strings, so no binary fixture is needed.
function buildXlsx(rows) {
  const strings = [];
  const index = (value) => {
    const found = strings.indexOf(value);
    if (found >= 0) return found;
    strings.push(value);
    return strings.length - 1;
  };
  const columns = "ABCDE";
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
    const ref = `${columns[columnIndex]}${rowIndex + 1}`;
    return typeof cell === "number" ? `<c r="${ref}"><v>${cell}</v></c>` : `<c r="${ref}" t="s"><v>${index(cell)}</v></c>`;
  }).join("")}</row>`).join("");
  const files = {
    "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    "xl/sharedStrings.xml": `<?xml version="1.0"?><sst>${strings.map((value) => `<si><t>${value.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`,
  };
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const compressed = deflateRawSync(data);
    const nameBuffer = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuffer, compressed);
    centrals.push(central, nameBuffer);
    offset += 30 + nameBuffer.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

const header = [
  ["Fund Name:", "SPDR MSCI ACWI IMI"],
  ["ISIN:", "IE00B3YLTY66"],
  ["NAV Currency:", "USD"],
  ["Date", "NAV", "Shares Outstanding"],
];

describe("xlsx reader", () => {
  it("reads shared strings and numbers from the first sheet", () => {
    const rows = readFirstSheet(buildXlsx([...header, ["23-Nov-2026", 12.2648, 760850154]]));
    expect(rows[1]).toEqual(["ISIN:", "IE00B3YLTY66"]);
    expect(rows[4]).toEqual(["23-Nov-2026", "12.2648", "760850154"]);
  });

  it("rejects something that is not a zip file", () => {
    expect(() => readFirstSheet(Buffer.from("<html>not found</html>"))).toThrow();
  });
});

describe("NAV history", () => {
  it("parses dates, sorts ascending and adjusts for the 1:25 split", () => {
    const { points, splits, currency } = parseNavHistory([
      ...header,
      ["24-Feb-2026", "12.1", "432300000"],
      ["23-Feb-2026", "12.0783", "432280675"],
      ["20-Feb-2026", "303.8492", "17291227"],
      ["19-Feb-2026", "300", "17291227"],
      ...Array.from({ length: 8 }, (_, day) => [`${10 + day}-Feb-2026`, "290", "17291227"]),
    ]);
    expect(currency).toBe("USD");
    expect(splits).toEqual([{ date: "2026-02-23", ratio: 25 }]);
    const byDate = Object.fromEntries(points.map((point) => [point.date, point.nav]));
    expect(byDate["2026-02-20"]).toBeCloseTo(303.8492 / 25, 6);
    expect(byDate["2026-02-23"]).toBeCloseTo(12.0783, 6);
    expect(points[0].date < points.at(-1).date).toBe(true);
  });

  it("rejects a sheet for another fund", () => {
    expect(() => parseNavHistory([["ISIN:", "IE0000000000"], ...Array.from({ length: 12 }, () => ["01-Jan-2026", "1"])])).toThrow();
  });

  it("converts to EUR with the same-day or previous ECB rate", () => {
    const eur = convertToEur(
      [{ date: "2026-11-20", nav: 11.898 }, { date: "2026-11-21", nav: 12 }, { date: "2026-11-23", nav: 12.2648 }],
      { "2026-11-20": 1.09, "2026-11-23": 1.0939 },
    );
    expect(eur.map((point) => point.t)).toEqual(["2026-11-20", "2026-11-21", "2026-11-23"]);
    expect(eur[1].v).toBeCloseTo(12 / 1.09, 6);
    expect(eur[2].v).toBeCloseTo(12.2648 / 1.0939, 6);
  });
});

describe("ranges", () => {
  const daily = Array.from({ length: 800 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 8, 1) + index * 86400000).toISOString().slice(0, 10);
    return { t: date, v: 10 + index / 100 };
  });

  it("computes the start of each range", () => {
    expect(rangeStart("1m", "2026-11-23")).toBe("2026-10-23");
    expect(rangeStart("ytd", "2026-11-23")).toBe("2026-01-01");
    expect(rangeStart("10y", "2026-11-23")).toBe("2016-11-23");
  });

  it("includes the baseline before the range so the change is measured from it", () => {
    const ytd = sliceDaily(daily, "ytd");
    expect(ytd[0].t).toBe("2025-12-31");
    expect(ytd[1].t).toBe("2026-01-01");
    expect(sliceDaily(daily, "5d")).toHaveLength(6);
  });

  it("downsamples long series but keeps the first and last point", () => {
    const reduced = downsample(daily, 100);
    expect(reduced).toHaveLength(100);
    expect(reduced[0]).toBe(daily[0]);
    expect(reduced.at(-1)).toBe(daily.at(-1));
  });

  it("keeps only the latest Xetra session and uses the previous session's last trade as baseline", () => {
    const result = latestSession({
      ticks: [
        { price: 11.3, time: "2026-11-24T10:00:00Z" },
        { price: 11.2, time: "2026-11-24T08:01:00Z" },
        { price: 11.0, time: "2026-11-23T16:29:00Z" },
        { price: 10.9, time: "2026-11-23T08:00:00Z" },
      ],
    });
    expect(result.session).toBe("2026-11-24");
    expect(result.previousClose).toBe(11.0);
    expect(result.points.map((point) => point.v)).toEqual([11.2, 11.3]);
  });

  it("turns Xetra ticks into 5-minute points with the last price per bucket", () => {
    const points = intradayPoints({
      ticks: [
        { price: 11.26, time: "2026-11-24T09:04:50Z" },
        { price: 11.25, time: "2026-11-24T09:01:00Z" },
        { price: 11.3, time: "2026-11-24T09:05:10Z" },
        { price: "x", time: "2026-11-24T09:06:00Z" },
      ],
    });
    expect(points).toEqual([
      { t: "2026-11-24T09:04:50.000Z", v: 11.26 },
      { t: "2026-11-24T09:05:10.000Z", v: 11.3 },
    ]);
  });
});

describe("IMIE history service", () => {
  const navRows = [...header];
  for (let index = 0; index < 400; index++) {
    const date = new Date(Date.UTC(2025, 9, 1) + index * 86400000);
    const label = `${String(date.getUTCDate()).padStart(2, "0")}-${date.toUTCString().slice(8, 11)}-${date.getUTCFullYear()}`;
    navRows.push([label, String(11 + index / 1000), "700000000"]);
  }
  const xlsx = buildXlsx(navRows);
  const rates = Object.fromEntries(Array.from({ length: 800 }, (_, index) => [
    new Date(Date.UTC(2025, 0, 1) + index * 86400000).toISOString().slice(0, 10),
    { USD: 1.1 },
  ]));

  function service() {
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("frankfurter")) return { rates };
      return { ticks: [{ price: 11.2, time: "2026-11-24T09:00:00Z" }, { price: 11.3, time: "2026-11-24T10:00:00Z" }] };
    });
    const fetchBuffer = vi.fn(async () => xlsx);
    return { fetchJson, fetchBuffer, history: createImieHistoryService({ fetchJson, fetchBuffer, now: () => Date.parse("2026-11-24T11:00:00Z") }) };
  }

  it("returns EUR points from the NAV and labels the basis honestly", async () => {
    const { history } = service();
    const result = await history.get("3m");
    expect(result).toMatchObject({ basis: "nav-eur", currency: "EUR", stale: false });
    expect(result.points.length).toBeGreaterThan(60);
    expect(result.points.at(-1).v).toBeCloseTo((11 + 399 / 1000) / 1.1, 6);
    expect(result.changePercent).toBeGreaterThan(0);
    expect(result.note).toContain("NAV");
  });

  it("returns intraday Xetra points for 1D and rejects unknown ranges", async () => {
    const { history } = service();
    const result = await history.get("1d");
    expect(result).toMatchObject({ basis: "xetra-intraday", session: "2026-11-24", points: [{ v: 11.2 }, { v: 11.3 }] });
    expect(result.changePercent).toBeCloseTo((0.1 / 11.2) * 100, 6);
    await expect(history.get("2w")).rejects.toMatchObject({ status: 400 });
  });

  it("caches the NAV file between ranges", async () => {
    const { history, fetchBuffer } = service();
    await history.get("1m");
    await history.get("6m");
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
  });
});
