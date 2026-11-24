import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createCalendarService } from "./calendar.js";
import { classifyFetchError, formatFetchError, logFetchFailure, upstreamError } from "./fetch-errors.js";
import { createSportsService } from "./sports.js";

const SECRET_URL = "https://p01-caldav.icloud.com/published/2/SECRET-TOKEN-abc123";

async function closedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe("fetch error classification", () => {
  it("reports the upstream HTTP status separately from the API status", () => {
    const error = upstreamError("Data source returned an error status.", { status: 503 });
    expect(error.status).toBeUndefined();
    expect(formatFetchError(error)).toBe("kind=http status=503");
  });

  it("recognises real network failures and timeouts from fetch", async () => {
    const port = await closedPort();
    const refused = await fetch(`http://127.0.0.1:${port}/`).catch((error) => error);
    expect(refused.name).toBe("TypeError");
    expect(formatFetchError(refused)).toBe("kind=network code=ECONNREFUSED");

    const slow = createServer(() => {});
    await new Promise((resolve) => slow.listen(0, "127.0.0.1", resolve));
    const timedOut = await fetch(`http://127.0.0.1:${slow.address().port}/`, { signal: AbortSignal.timeout(50) }).catch((error) => error);
    slow.closeAllConnections();
    slow.close();
    expect(formatFetchError(timedOut)).toBe("kind=timeout");
  });

  it("finds the system code inside an AggregateError cause", () => {
    const error = new TypeError("fetch failed");
    error.cause = new AggregateError([Object.assign(new Error("x"), { code: "ETIMEDOUT" })]);
    expect(classifyFetchError(error)).toEqual({ kind: "network", code: "ETIMEDOUT" });
  });

  it("never exposes messages, URLs or unsafe values", () => {
    const invalid = (() => {
      try {
        new URL(`not a url ${SECRET_URL}`);
      } catch (error) {
        return error;
      }
    })();
    expect(invalid.input).toContain("SECRET-TOKEN");
    expect(formatFetchError(invalid)).toBe("kind=unknown name=TypeError");

    const leaky = new Error(`request to ${SECRET_URL} failed`);
    leaky.cause = { code: `${SECRET_URL}` };
    leaky.name = "Bad Name https://x";
    expect(formatFetchError(leaky)).toBe("kind=unknown name=Error");
    expect(formatFetchError(new SyntaxError(`Unexpected token in ${SECRET_URL}`))).toBe("kind=parse");
  });

  it("adds the fixed reason of configuration errors and drops anything else", () => {
    const config = Object.assign(new Error("x"), { kind: "config", reason: "invalid-url:2" });
    expect(formatFetchError(config)).toBe("kind=config reason=invalid-url:2");
    const unsafe = Object.assign(new Error("x"), { kind: "config", reason: `invalid ${SECRET_URL}` });
    expect(formatFetchError(unsafe)).toBe("kind=config");
  });

  it("logs a fixed label and replaces anything that looks unsafe", () => {
    const log = vi.fn();
    logFetchFailure("News source", "de-tijd", upstreamError("x", { status: 500 }), log);
    logFetchFailure("Calendar", SECRET_URL, new Error("x"), log);
    logFetchFailure("API request", "/api/sport/nba/overview", new Error("x"), log);
    for (const unsafe of ["https:x", "//evil", "a@b", "x?token=1", "webcal:abc/def", "/api/calendar?url=x"]) logFetchFailure("Calendar", unsafe, new Error("x"), log);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      "News source failed: de-tijd kind=http status=500",
      "Calendar failed: unlabelled kind=unknown name=Error",
      "API request failed: /api/sport/nba/overview kind=unknown name=Error",
      ...Array(6).fill("Calendar failed: unlabelled kind=unknown name=Error"),
    ]);
  });
});

describe("services report failures with their real cause", () => {
  it("sports passes each failing part and the underlying fetch error to onError", async () => {
    const onError = vi.fn();
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("standings")) throw upstreamError("x", { status: 503 });
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    });
    const service = createSportsService({ fetchJson, onError, now: () => Date.parse("2026-11-24T10:00:00Z") });
    await expect(service.overview("nba")).rejects.toMatchObject({ status: 502 });
    const logged = Object.fromEntries(onError.mock.calls.map(([key, error]) => [key, formatFetchError(error)]));
    expect(logged["standings:nba"]).toBe("kind=http status=503");
    expect(logged["fixtures:nba"]).toBe("kind=network code=ECONNRESET");
    expect(logged["players:nba"]).toBe("kind=network code=ECONNRESET");
  });

  it("calendar reports the internal calendar id, never the URL", async () => {
    const onCalendarError = vi.fn();
    const service = createCalendarService({
      fetchText: async () => { throw upstreamError("Agenda gaf een foutstatus.", { status: 404 }); },
      getCalendars: () => [{ id: "cal-1", name: "Gezin", color: "#4f8cff", url: SECRET_URL }],
      onCalendarError,
    });
    await expect(service.get()).rejects.toMatchObject({ status: 502 });
    expect(onCalendarError).toHaveBeenCalledTimes(1);
    const [id, error] = onCalendarError.mock.calls[0];
    expect(id).toBe("cal-1");
    expect(formatFetchError(error)).toBe("kind=http status=404");
  });
});
