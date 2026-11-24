import { describe, expect, it } from "vitest";
import { dailyForecast, dayparts, dominantWeatherCode, mapForecast, upcomingHours } from "./weather.js";

function hourlyFor(dates) {
  const time = [];
  for (const date of dates) for (let hour = 0; hour < 24; hour++) time.push(`${date}T${String(hour).padStart(2, "0")}:00`);
  return {
    time,
    temperature_2m: time.map((_, index) => index % 24),
    precipitation_probability: time.map((_, index) => (index % 24 === 15 ? 60 : 10)),
    precipitation: time.map(() => 0),
    weather_code: time.map((_, index) => (index % 24 < 12 ? 3 : 61)),
    wind_speed_10m: time.map(() => 12),
    is_day: time.map((_, index) => (index % 24 >= 8 && index % 24 < 17 ? 1 : 0)),
  };
}

const daily = {
  time: ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"],
  weather_code: [45, 3, 61, 0, 71],
  temperature_2m_max: [3.7, 2.3, 5, 6, 1],
  temperature_2m_min: [-3.7, -1.5, 1, 2, -2],
  precipitation_sum: [0, 0, 4.2, 0, 1],
  precipitation_probability_max: [0, 21, 80, 5, 40],
  sunrise: ["2026-11-24T08:10", "2026-11-25T08:11", "2026-11-26T08:13", "2026-11-27T08:14", "2026-11-28T08:16"],
  sunset: ["2026-11-24T16:42", "2026-11-25T16:41", "2026-11-26T16:40", "2026-11-27T16:40", "2026-11-28T16:39"],
  uv_index_max: [1.45, 1.2, 0.8, 1.5, 0.9],
  wind_speed_10m_max: [12.2, 15.5, 30, 10, 20],
};

describe("weather mapping", () => {
  it("averages morning, afternoon and evening and marks the current part", () => {
    const parts = dayparts(hourlyFor(["2026-11-24"]), "2026-11-24", "2026-11-24T13:15");
    expect(parts.map((part) => part.label)).toEqual(["Ochtend", "Middag", "Avond"]);
    expect(parts[0]).toMatchObject({ averageTemperature: 8.5, weatherCode: 3, status: "past", precipitationProbabilityMax: 10 });
    expect(parts[1]).toMatchObject({ averageTemperature: 14.5, weatherCode: 61, status: "current", precipitationProbabilityMax: 60 });
    expect(parts[2]).toMatchObject({ averageTemperature: 20.5, status: "upcoming" });
  });

  it("returns null averages instead of zero when hours are missing", () => {
    const parts = dayparts({ time: ["2026-11-24T07:00"], temperature_2m: [null] }, "2026-11-24", "2026-11-24T05:00");
    expect(parts[0].averageTemperature).toBeNull();
    expect(parts[1].averageTemperature).toBeNull();
  });

  it("prefers the most frequent and then the most severe weather code", () => {
    expect(dominantWeatherCode([3, 3, 61])).toBe(3);
    expect(dominantWeatherCode([3, 61])).toBe(61);
    expect(dominantWeatherCode([null, null])).toBeNull();
  });

  it("maps the daily forecast and the next 48 hours from the current hour", () => {
    expect(dailyForecast(daily)[2]).toMatchObject({ date: "2026-11-26", weatherCode: 61, precipitationSum: 4.2, uvIndexMax: 0.8 });
    const hours = upcomingHours(hourlyFor(["2026-11-24", "2026-11-25", "2026-11-26"]), "2026-11-24T13:15");
    expect(hours).toHaveLength(48);
    expect(hours[0].time).toBe("2026-11-24T13:00");
  });

  it("builds the dashboard payload with today and the next three days", () => {
    const result = mapForecast({
      timezone: "Europe/Brussels",
      current: { time: "2026-11-24T11:15", temperature_2m: 1, apparent_temperature: -3, relative_humidity_2m: 74, wind_speed_10m: 6, weather_code: 2, is_day: 1 },
      hourly: hourlyFor(["2026-11-24", "2026-11-25", "2026-11-26"]),
      daily,
    }, "Diest");
    expect(result).toMatchObject({ location: "Diest", temperature: 1, isDay: true, today: { date: "2026-11-24" } });
    expect(result.nextDays.map((day) => day.date)).toEqual(["2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(result.dayparts[0].status).toBe("current");
  });

  it("rejects an incomplete response instead of inventing weather", () => {
    expect(() => mapForecast({ current: { time: "2026-11-24T11:15" } }, "Diest")).toThrow();
  });
});
