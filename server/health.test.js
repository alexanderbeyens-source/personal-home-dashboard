import { describe, expect, it, vi } from "vitest";
import { createHealthService, healthConfigFromEnv, mapActivities, mapWellness, summarize } from "./health.js";

// Shapes follow the intervals.icu OpenAPI Wellness and Activity schemas.
const wellness = [
  { id: "2026-11-24", sleepSecs: 26100, sleepScore: 81, restingHR: 52, hrv: 61.5, steps: 2300, weight: null },
  { id: "2026-11-23", sleepSecs: 24000, sleepScore: 74, restingHR: 54, hrv: 55, steps: 11200 },
  { id: "2026-11-22", sleepSecs: 27000, sleepScore: 85, restingHR: 51, hrv: 64, steps: 9100 },
  { id: "2026-11-21", sleepSecs: 25200, restingHR: 53, hrv: 58, steps: 8000 },
  { id: "2026-11-20", sleepSecs: 0, sleepScore: null, restingHR: 0, steps: 7000 },
  { id: "not-a-date", restingHR: 40 },
];

describe("health mapping", () => {
  it("maps wellness records ascending and keeps missing or zero values as null", () => {
    const days = mapWellness(wellness);
    expect(days.map((day) => day.date)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
    expect(days[0]).toMatchObject({ sleepSeconds: null, sleepScore: null, restingHr: null, hrv: null, steps: 7000 });
    expect(days[4]).toMatchObject({ sleepSeconds: 26100, sleepScore: 81, restingHr: 52, hrv: 61.5, weight: null });
  });

  it("summarizes the latest value with a 7-day average of the days before", () => {
    const summary = summarize(mapWellness(wellness), "2026-11-24");
    expect(summary.restingHr).toEqual({ value: 52, date: "2026-11-24", average7d: (54 + 51 + 53) / 3 });
    expect(summary.sleepScore).toEqual({ value: 81, date: "2026-11-24", average7d: null });
  });

  it("maps the latest activities", () => {
    const activities = mapActivities([
      { id: "i1", name: "Ochtendloop", type: "Run", start_date_local: "2026-11-23T07:10:00", moving_time: 1800, distance: 5200, average_heartrate: 148, icu_training_load: 42 },
      { id: "i2", name: "", type: "Ride", start_date_local: "2026-11-24T17:00:00", elapsed_time: 3600, icu_distance: 30000 },
      { id: "i3", type: "Walk" },
    ]);
    expect(activities.map((activity) => activity.id)).toEqual(["i2", "i1"]);
    expect(activities[0]).toMatchObject({ name: null, movingSeconds: 3600, distanceMeters: 30000, averageHr: null });
    expect(activities[1]).toMatchObject({ name: "Ochtendloop", movingSeconds: 1800, distanceMeters: 5200, averageHr: 148, trainingLoad: 42 });
  });

  it("validates the athlete id", () => {
    expect(healthConfigFromEnv({})).toBeNull();
    expect(healthConfigFromEnv({ INTERVALS_ATHLETE_ID: "i12345", INTERVALS_API_KEY: "k" })).toEqual({ athleteId: "i12345", apiKey: "k" });
    expect(() => healthConfigFromEnv({ INTERVALS_ATHLETE_ID: "../x", INTERVALS_API_KEY: "k" })).toThrow();
  });
});

describe("health service", () => {
  const now = () => Date.parse("2026-11-24T09:00:00Z");

  it("requests the documented endpoints for the last 14 days and caches the result", async () => {
    const getJson = vi.fn(async (path) => (path.includes("/wellness") ? wellness : []));
    const service = createHealthService({ getJson, now });
    const result = await service.get({ athleteId: "i12345" });
    expect(getJson.mock.calls.map(([path]) => path)).toEqual([
      "/athlete/i12345/wellness?oldest=2026-11-11&newest=2026-11-24",
      "/athlete/i12345/activities?oldest=2026-10-25&newest=2026-11-24T23:59:59&limit=20",
    ]);
    expect(result).toMatchObject({ today: "2026-11-24", stale: false, warnings: [], source: "Garmin via intervals.icu" });
    await service.get({ athleteId: "i12345" });
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it("keeps wellness when activities fail and serves stale data after a failure", async () => {
    let fail = false;
    const getJson = vi.fn(async (path) => {
      if (path.includes("/activities") || fail) throw new Error("Data source returned 500");
      return wellness;
    });
    const service = createHealthService({ getJson, now, ttlMs: 0 });
    const first = await service.get({ athleteId: "i1" });
    expect(first.warnings.map((warning) => warning.source)).toEqual(["Activiteiten"]);
    expect(first.days).toHaveLength(5);
    fail = true;
    const second = await service.get({ athleteId: "i1" });
    expect(second.stale).toBe(true);
    expect(second.days).toHaveLength(5);
  });

  it("fails when nothing can be loaded", async () => {
    const service = createHealthService({ getJson: async () => { throw new Error("Data source returned 401"); }, now });
    await expect(service.get({ athleteId: "i1" })).rejects.toThrow();
  });
});
