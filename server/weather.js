// Maps an Open-Meteo forecast (requested with timezone=auto, so all times are
// local wall-clock strings such as "2026-11-24T13:00") to the dashboard shape.

export const WEATHER_HOURLY = "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day";
export const WEATHER_DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "sunrise",
  "sunset",
  "uv_index_max",
  "wind_speed_10m_max",
].join(",");
export const WEATHER_CURRENT = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m";

export const DAYPARTS = [
  { id: "morning", label: "Ochtend", from: 6, to: 12 },
  { id: "afternoon", label: "Middag", from: 12, to: 18 },
  { id: "evening", label: "Avond", from: 18, to: 24 },
];

const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const round1 = (value) => Math.round(value * 10) / 10;

function hourlyRows(hourly) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  return times.map((time, index) => ({
    time,
    temperature: finite(hourly.temperature_2m?.[index]),
    precipitationProbability: finite(hourly.precipitation_probability?.[index]),
    precipitation: finite(hourly.precipitation?.[index]),
    weatherCode: finite(hourly.weather_code?.[index]),
    windSpeed: finite(hourly.wind_speed_10m?.[index]),
    isDay: hourly.is_day?.[index] === undefined ? null : Boolean(hourly.is_day[index]),
  }));
}

// The most frequent code wins; on a tie the more severe (higher) WMO code wins.
export function dominantWeatherCode(codes) {
  const counts = new Map();
  for (const code of codes) if (code !== null) counts.set(code, (counts.get(code) ?? 0) + 1);
  let best = null;
  for (const [code, count] of counts) {
    if (best === null || count > best.count || (count === best.count && code > best.code)) best = { code, count };
  }
  return best?.code ?? null;
}

export function dayparts(hourly, date, nowLocal) {
  const rows = hourlyRows(hourly).filter((row) => row.time.startsWith(`${date}T`));
  const nowHour = nowLocal?.startsWith(`${date}T`) ? Number(nowLocal.slice(11, 13)) : null;
  return DAYPARTS.map((part) => {
    const inPart = rows.filter((row) => {
      const hour = Number(row.time.slice(11, 13));
      return hour >= part.from && hour < part.to;
    });
    const temperatures = inPart.map((row) => row.temperature).filter((value) => value !== null);
    const probabilities = inPart.map((row) => row.precipitationProbability).filter((value) => value !== null);
    return {
      id: part.id,
      label: part.label,
      from: part.from,
      to: part.to,
      averageTemperature: temperatures.length ? round1(temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length) : null,
      weatherCode: dominantWeatherCode(inPart.map((row) => row.weatherCode)),
      precipitationProbabilityMax: probabilities.length ? Math.max(...probabilities) : null,
      status: nowHour === null ? "upcoming" : nowHour >= part.to ? "past" : nowHour >= part.from ? "current" : "upcoming",
    };
  });
}

export function dailyForecast(daily) {
  const times = Array.isArray(daily?.time) ? daily.time : [];
  return times.map((date, index) => ({
    date,
    weatherCode: finite(daily.weather_code?.[index]),
    temperatureMax: finite(daily.temperature_2m_max?.[index]),
    temperatureMin: finite(daily.temperature_2m_min?.[index]),
    precipitationSum: finite(daily.precipitation_sum?.[index]),
    precipitationProbabilityMax: finite(daily.precipitation_probability_max?.[index]),
    sunrise: daily.sunrise?.[index] ?? null,
    sunset: daily.sunset?.[index] ?? null,
    uvIndexMax: finite(daily.uv_index_max?.[index]),
    windSpeedMax: finite(daily.wind_speed_10m_max?.[index]),
  }));
}

export function upcomingHours(hourly, nowLocal, count = 48) {
  const currentHour = `${nowLocal.slice(0, 13)}:00`;
  return hourlyRows(hourly).filter((row) => row.time >= currentHour).slice(0, count);
}

export function mapForecast(payload, location) {
  const current = payload?.current;
  if (!current || typeof current.time !== "string" || finite(current.temperature_2m) === null) {
    throw new Error("Weergegevens van Open-Meteo zijn onvolledig.");
  }
  const today = current.time.slice(0, 10);
  const days = dailyForecast(payload.daily);
  return {
    location,
    timezone: payload.timezone ?? null,
    observedAt: current.time,
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    weatherCode: current.weather_code,
    isDay: Boolean(current.is_day),
    today: days.find((day) => day.date === today) ?? null,
    dayparts: dayparts(payload.hourly, today, current.time),
    nextDays: days.filter((day) => day.date > today).slice(0, 3),
    days,
    hours: upcomingHours(payload.hourly, current.time, 48),
  };
}
