import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveResource } from "../types";

export function useLiveResource<T>(
  url: string,
  refreshInterval = 5 * 60 * 1000,
  refreshUrl = url,
): LiveResource<T> {
  const [resource, setResource] = useState<Omit<LiveResource<T>, "refresh">>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
    updatedAt: null,
  });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let active = true;
    let inFlight: Promise<void> | null = null;
    let controller: AbortController | null = null;

    setResource({
      data: null,
      loading: true,
      refreshing: false,
      error: null,
      updatedAt: null,
    });

    const load = async (requestUrl = url) => {
      if (inFlight) return inFlight;

      controller = new AbortController();
      const requestController = controller;
      setResource((current) => ({
        ...current,
        loading: current.data === null,
        refreshing: current.data !== null,
        error: null,
      }));

      const request = (async () => {
        try {
          const response = await fetch(requestUrl, { signal: requestController.signal });
          const payload: unknown = await response.json();
          if (!response.ok) {
            if (response.status === 401 && active) {
              window.dispatchEvent(new Event("northstar:session-expired"));
            }
            const message =
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
                ? payload.error
                : `Request failed (${response.status})`;
            throw new Error(message);
          }
          if (active) {
            setResource({
              data: payload as T,
              loading: false,
              refreshing: false,
              error: null,
              updatedAt: new Date(),
            });
          }
        } catch (error) {
          if (active) {
            setResource((current) => ({
              ...current,
              loading: false,
              refreshing: false,
              error: error instanceof Error ? error.message : "Unable to load data.",
            }));
          }
        }
      })();
      inFlight = request;

      try {
        await request;
      } finally {
        if (inFlight === request) {
          inFlight = null;
          controller = null;
        }
      }
    };

    refreshRef.current = () => load(refreshUrl);
    void load(url);
    const timer = window.setInterval(() => void load(url), refreshInterval);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
      if (refreshRef.current === load) refreshRef.current = async () => {};
    };
  }, [url, refreshInterval]);

  return { ...resource, refresh };
}
