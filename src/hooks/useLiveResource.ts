import { useEffect, useState } from "react";
import type { LiveResource } from "../types";

export function useLiveResource<T>(
  url: string,
  refreshInterval = 5 * 60 * 1000,
): LiveResource<T> {
  const [resource, setResource] = useState<LiveResource<T>>({
    data: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let active = true;
    let firstLoad = true;

    const load = async () => {
      if (firstLoad && active) {
        setResource((current) => ({ ...current, loading: true, error: null }));
      }

      try {
        const response = await fetch(url);
        const payload: unknown = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
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
            error: null,
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        if (active) {
          setResource((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Unable to load data.",
          }));
        }
      } finally {
        firstLoad = false;
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), refreshInterval);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [url, refreshInterval]);

  return resource;
}
