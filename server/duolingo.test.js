import { describe, expect, it, vi } from "vitest";
import { createDuolingoService, duolingoConfigFromEnv, mapProfile } from "./duolingo.js";

const profile = (overrides = {}) => ({
  users: [{
    id: 1,
    username: "learner",
    name: "Should not leak",
    picture: "//example.invalid/avatar",
    streak: 41,
    streakData: { currentStreak: { length: 42, startDate: "2026-10-15", endDate: "2026-11-25" } },
    totalXp: 12345,
    currentCourseId: "DUOLINGO_ES_NL",
    courses: [
      { id: "DUOLINGO_FR_NL", title: "Frans", learningLanguage: "fr", xp: 300 },
      { id: "DUOLINGO_ES_NL", title: "Spaans", learningLanguage: "es", xp: 9000 },
      { id: "DUOLINGO_DE_NL", title: "Duits", learningLanguage: "de", xp: 0 },
    ],
    ...overrides,
  }],
});

describe("duolingoConfigFromEnv", () => {
  it("is not configured without a username", () => {
    expect(duolingoConfigFromEnv({})).toBeNull();
    expect(duolingoConfigFromEnv({ DUOLINGO_USERNAME: "  " })).toBeNull();
  });

  it("accepts a plain username and rejects anything that could change the URL", () => {
    expect(duolingoConfigFromEnv({ DUOLINGO_USERNAME: " Learner_1 " })).toEqual({ username: "Learner_1" });
    for (const bad of ["a&fields=x", "a/b", "a b", "x".repeat(41)]) {
      expect(() => duolingoConfigFromEnv({ DUOLINGO_USERNAME: bad })).toThrow(expect.objectContaining({ code: "invalid_config", reason: "invalid-username" }));
    }
  });
});

describe("mapProfile", () => {
  it("keeps only streak, XP and courses, sorted by XP without empty courses", () => {
    const result = mapProfile(profile(), "2026-11-25");
    expect(result).toEqual({
      today: "2026-11-25",
      streak: 42,
      streakStart: "2026-10-15",
      lastPracticeDate: "2026-11-25",
      status: "practiced",
      totalXp: 12345,
      currentCourse: { id: "DUOLINGO_ES_NL", title: "Spaans", learningLanguage: "es", xp: 9000 },
      courses: [
        { id: "DUOLINGO_ES_NL", title: "Spaans", learningLanguage: "es", xp: 9000 },
        { id: "DUOLINGO_FR_NL", title: "Frans", learningLanguage: "fr", xp: 300 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("Should not leak");
  });

  it("marks a streak last extended yesterday as still to do today", () => {
    expect(mapProfile(profile(), "2026-11-26")).toMatchObject({ status: "pending", streak: 42 });
  });

  it("shows a streak that was not extended for more than a day as broken", () => {
    expect(mapProfile(profile(), "2026-11-28")).toMatchObject({ status: "broken", streak: 0, streakStart: null, lastPracticeDate: "2026-11-25" });
    expect(mapProfile(profile({ streak: 0, streakData: { currentStreak: null } }), "2026-11-25")).toMatchObject({ status: "broken", streak: 0 });
  });

  it("leaves missing values null instead of zero", () => {
    const result = mapProfile(profile({ streak: undefined, streakData: undefined, totalXp: "n/a", courses: undefined }), "2026-11-25");
    expect(result).toMatchObject({ streak: null, status: null, totalXp: null, currentCourse: null, courses: [] });
  });

  it("explains an unknown or private profile as a configuration problem", () => {
    expect(() => mapProfile({ users: [] }, "2026-11-25")).toThrow(expect.objectContaining({ code: "invalid_config", reason: "profile-not-found" }));
    expect(() => mapProfile({}, "2026-11-25")).toThrow(expect.objectContaining({ code: "invalid_config" }));
  });
});

describe("createDuolingoService", () => {
  const now = () => Date.parse("2026-11-25T18:00:00Z");

  it("caches the profile and bypasses the cache on refresh", async () => {
    const getJson = vi.fn(async () => profile());
    const service = createDuolingoService({ getJson, now });
    const first = await service.get({ username: "learner" });
    await service.get({ username: "learner" });
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getJson).toHaveBeenCalledWith("learner");
    expect(first).toMatchObject({ streak: 42, stale: false, profileUrl: "https://www.duolingo.com/profile/learner" });
    await service.get({ username: "learner", refresh: true });
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it("returns the last known good profile marked stale when Duolingo fails", async () => {
    const getJson = vi.fn(async () => profile());
    const service = createDuolingoService({ getJson, now });
    await service.get({ username: "learner" });
    getJson.mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }));
    expect(await service.get({ username: "learner", refresh: true })).toMatchObject({ streak: 42, stale: true });
  });

  it("fails without cached data, and never hides a missing profile behind stale data", async () => {
    const getJson = vi.fn(async () => { throw Object.assign(new Error("down"), { status: 503 }); });
    await expect(createDuolingoService({ getJson, now }).get({ username: "learner" })).rejects.toMatchObject({ status: 503 });

    const service = createDuolingoService({ getJson: vi.fn().mockResolvedValueOnce(profile()).mockResolvedValueOnce({ users: [] }), now });
    await service.get({ username: "learner" });
    await expect(service.get({ username: "learner", refresh: true })).rejects.toMatchObject({ code: "invalid_config" });
  });
});
