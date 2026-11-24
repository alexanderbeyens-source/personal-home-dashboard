// Health data from Garmin via intervals.icu (free; personal API key). Field names follow the
// intervals.icu OpenAPI spec (Wellness and Activity schemas). Missing values stay null.

export const INTERVALS_API = "https://intervals.icu/api/v1";
export const HEALTH_TIMEZONE = "Europe/Brussels";
const WELLNESS_DAYS = 14;
const ACTIVITY_DAYS = 30;
const ACTIVITY_LIMIT = 5;

const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const positive = (value) => {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

export function healthConfigFromEnv(env) {
  const athleteId = env.INTERVALS_ATHLETE_ID?.trim();
  const apiKey = env.INTERVALS_API_KEY?.trim();
  if (!athleteId || !apiKey) return null;
  if (!/^i?\d{1,12}$/.test(athleteId)) {
    const error = new Error("De gezondheidskoppeling is ongeldig ingesteld.");
    error.status = 500;
    throw error;
  }
  return { athleteId, apiKey };
}

export function localDate(timestamp, timeZone = HEALTH_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mapWellness(records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => typeof record?.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.id))
    .map((record) => ({
      date: record.id,
      sleepSeconds: positive(record.sleepSecs),
      sleepScore: positive(record.sleepScore),
      restingHr: positive(record.restingHR),
      hrv: positive(record.hrv),
      steps: number(record.steps) !== null && record.steps >= 0 ? record.steps : null,
      avgSleepingHr: positive(record.avgSleepingHR),
      readiness: positive(record.readiness),
      spO2: positive(record.spO2),
      respiration: positive(record.respiration),
      weight: positive(record.weight),
    }))
    .sort((first, second) => first.date.localeCompare(second.date));
}

export function mapActivities(records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && (typeof record.id === "string" || typeof record.id === "number"))
    .map((record) => ({
      id: String(record.id),
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 80) : null,
      type: typeof record.type === "string" ? record.type : null,
      start: typeof record.start_date_local === "string" ? record.start_date_local : null,
      movingSeconds: positive(record.moving_time) ?? positive(record.elapsed_time),
      distanceMeters: positive(record.distance) ?? positive(record.icu_distance),
      averageHr: positive(record.average_heartrate),
      calories: positive(record.calories),
      trainingLoad: positive(record.icu_training_load),
    }))
    .filter((activity) => activity.start)
    .sort((first, second) => second.start.localeCompare(first.start))
    .slice(0, ACTIVITY_LIMIT);
}

const METRICS = ["sleepSeconds", "sleepScore", "restingHr", "hrv", "steps"];

// Latest known value per metric (with its date) and a 7-day average excluding that day.
export function summarize(days, today) {
  const summary = {};
  for (const metric of METRICS) {
    const known = days.filter((day) => day[metric] !== null);
    const latest = known.at(-1) ?? null;
    const weekStart = addDays(today, -7);
    const previous = known.filter((day) => day.date >= weekStart && day.date !== latest?.date);
    summary[metric] = {
      value: latest ? latest[metric] : null,
      date: latest?.date ?? null,
      average7d: previous.length >= 3 ? previous.reduce((total, day) => total + day[metric], 0) / previous.length : null,
    };
  }
  return summary;
}

// getJson(path) must call the intervals.icu API with the athlete's key.
export function createHealthService({ getJson, now = () => Date.now(), ttlMs = 30 * 60 * 1000 }) {
  const cache = new Map();

  async function cached(key, load) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now()) return { value: entry.value, stale: entry.stale };
    try {
      const value = await load();
      cache.set(key, { value, expiresAt: now() + ttlMs, stale: false });
      return { value, stale: false };
    } catch (error) {
      if (entry) {
        cache.set(key, { ...entry, expiresAt: now() + 2 * 60 * 1000, stale: true });
        return { value: entry.value, stale: true };
      }
      throw error;
    }
  }

  async function get({ athleteId, refresh = false }) {
    if (refresh) cache.clear();
    const today = localDate(now());
    const id = encodeURIComponent(athleteId);
    const [wellness, activities] = await Promise.allSettled([
      cached("wellness", async () => mapWellness(await getJson(`/athlete/${id}/wellness?oldest=${addDays(today, -(WELLNESS_DAYS - 1))}&newest=${today}`))),
      cached("activities", async () => mapActivities(await getJson(`/athlete/${id}/activities?oldest=${addDays(today, -ACTIVITY_DAYS)}&newest=${today}T23:59:59&limit=${ACTIVITY_LIMIT * 4}`))),
    ]);
    if (wellness.status === "rejected" && activities.status === "rejected") throw wellness.reason;
    const warnings = [];
    if (wellness.status === "rejected") warnings.push({ source: "Wellness", message: "Slaap- en hartslagdata tijdelijk niet beschikbaar.", stale: false });
    if (activities.status === "rejected") warnings.push({ source: "Activiteiten", message: "Activiteiten tijdelijk niet beschikbaar.", stale: false });
    const days = wellness.status === "fulfilled" ? wellness.value.value : [];
    return {
      today,
      days,
      summary: summarize(days, today),
      activities: activities.status === "fulfilled" ? activities.value.value : [],
      stale: (wellness.status === "fulfilled" && wellness.value.stale) || (activities.status === "fulfilled" && activities.value.stale),
      warnings,
      source: "Garmin via intervals.icu",
      sourceUrl: "https://intervals.icu/",
    };
  }

  return { get };
}
