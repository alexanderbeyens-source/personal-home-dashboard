// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveResource } from "./useLiveResource";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useLiveResource", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads a successful API response and records its update time", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: "fresh" }));

    const { result } = renderHook(() => useLiveResource<{ value: string }>("/api/test", 60_000));
    await waitFor(() => expect(result.current.data).toEqual({ value: "fresh" }));

    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.updatedAt).toBeInstanceOf(Date);
  });

  it("reports a failed initial API response without fabricating data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Source unavailable" }, 502));

    const { result } = renderHook(() => useLiveResource<{ value: string }>("/api/test", 60_000));
    await waitFor(() => expect(result.current.error).toBe("Source unavailable"));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.updatedAt).toBeNull();
  });

  it("distinguishes a missing server configuration from a generic failure", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "Deze koppeling is niet geconfigureerd op de server.", code: "not_configured" }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: "Live gegevens zijn tijdelijk niet beschikbaar." }, 503));

    const configured = renderHook(() => useLiveResource<{ value: string }>("/api/calendar", 60_000));
    await waitFor(() => expect(configured.result.current.loading).toBe(false));
    expect(configured.result.current.notConfigured).toBe(true);
    expect(configured.result.current.data).toBeNull();

    const failing = renderHook(() => useLiveResource<{ value: string }>("/api/weather", 60_000));
    await waitFor(() => expect(failing.result.current.loading).toBe(false));
    expect(failing.result.current.notConfigured).toBe(false);
    expect(failing.result.current.error).toBe("Live gegevens zijn tijdelijk niet beschikbaar.");
  });

  it("preserves the last successful data after a failed refresh and can retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ value: "last good value" }))
      .mockResolvedValueOnce(jsonResponse({ error: "Temporary outage" }, 503))
      .mockResolvedValueOnce(jsonResponse({ value: "recovered" }));

    const { result } = renderHook(() => useLiveResource<{ value: string }>("/api/test", 60_000));
    await waitFor(() => expect(result.current.data?.value).toBe("last good value"));
    const lastSuccess = result.current.updatedAt;

    await act(async () => result.current.refresh());
    expect(result.current.data).toEqual({ value: "last good value" });
    expect(result.current.updatedAt).toBe(lastSuccess);
    expect(result.current.error).toBe("Temporary outage");

    await act(async () => result.current.refresh());
    expect(result.current.data).toEqual({ value: "recovered" });
    expect(result.current.error).toBeNull();
    expect(result.current.updatedAt?.getTime()).toBeGreaterThanOrEqual(lastSuccess!.getTime());
  });

  it("uses a separate refresh URL for explicit refreshes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ value: "cached" }))
      .mockResolvedValueOnce(jsonResponse({ value: "regenerated" }));

    const { result } = renderHook(() => useLiveResource<{ value: string }>(
      "/api/briefing",
      60_000,
      "/api/briefing?refresh=1",
    ));
    await waitFor(() => expect(result.current.data?.value).toBe("cached"));

    await act(async () => result.current.refresh());

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/briefing",
      "/api/briefing?refresh=1",
    ]);
    expect(result.current.data?.value).toBe("regenerated");
  });

  it("does not start an overlapping request", async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveResponse = resolve;
    }));

    const { result } = renderHook(() => useLiveResource<{ value: string }>("/api/test", 60_000));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveResponse(jsonResponse({ value: "only request" }));
      await refreshPromise;
    });
    expect(result.current.data).toEqual({ value: "only request" });
  });
});
