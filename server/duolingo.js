// Duolingo streak and XP from the public profile endpoint. Duolingo has no official public
// API: this is the unofficial, undocumented endpoint behind duolingo.com profile pages. It
// needs no login or token, only the username of a public profile, and may change or break
// without notice; failures fall back to the last known good value and are then shown as stale.

export const DUOLINGO_API = "https://www.duolingo.com/2017-06-30/users";
export const DUOLINGO_TIMEZONE = "Europe/Brussels";
const MAX_COURSES = 5;

const count = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function configError(message, reason) {
  const error = new Error(message);
  error.status = 500;
  error.kind = "config";
  error.code = "invalid_config";
  error.reason = reason;
  return error;
}

export function duolingoConfigFromEnv(env) {
  const username = env.DUOLINGO_USERNAME?.trim();
  if (!username) return null;
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) {
    throw configError("De Duolingo-koppeling is ongeldig ingesteld.", "invalid-username");
  }
  return { username };
}

export function localDate(timestamp, timeZone = DUOLINGO_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Keeps only the streak, XP and course fields; everything else in the profile is dropped.
export function mapProfile(json, today) {
  const user = Array.isArray(json?.users) ? json.users[0] : null;
  if (!user || typeof user !== "object") {
    throw configError("Het Duolingo-profiel werd niet gevonden. Controleer de gebruikersnaam en of het profiel publiek is.", "profile-not-found");
  }
  const current = user.streakData?.currentStreak;
  const lastPracticeDate = isDate(current?.endDate) ? current.endDate : null;
  // Duolingo extends a streak on the day of practice; it survives until the end of the next day.
  let status = null;
  if (lastPracticeDate === today) status = "practiced";
  else if (lastPracticeDate === addDays(today, -1)) status = "pending";
  else if (lastPracticeDate) status = "broken";
  else if (current === null && count(user.streak) === 0) status = "broken";

  const reported = count(current?.length) ?? count(user.streak);
  const courses = (Array.isArray(user.courses) ? user.courses : [])
    .filter((course) => course && typeof course.id === "string" && typeof course.title === "string" && course.title.trim())
    .map((course) => ({
      id: course.id,
      title: course.title.trim().slice(0, 60),
      learningLanguage: typeof course.learningLanguage === "string" ? course.learningLanguage : null,
      xp: count(course.xp),
    }));
  const currentCourse = courses.find((course) => course.id === user.currentCourseId) ?? null;
  return {
    today,
    streak: status === "broken" ? 0 : reported,
    streakStart: status !== "broken" && isDate(current?.startDate) ? current.startDate : null,
    lastPracticeDate,
    status,
    totalXp: count(user.totalXp),
    currentCourse,
    courses: courses
      .filter((course) => course.xp !== null && course.xp > 0)
      .sort((first, second) => second.xp - first.xp)
      .slice(0, MAX_COURSES),
  };
}

// getJson(username) must return the parsed response of the public profile endpoint.
export function createDuolingoService({ getJson, now = () => Date.now(), ttlMs = 15 * 60 * 1000 }) {
  let cache = null;
  let inFlight = null;

  async function get({ username, refresh = false }) {
    const today = localDate(now());
    if (!refresh && cache && cache.username === username && cache.expiresAt > now() && cache.value.today === today) return cache.value;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const value = {
          ...mapProfile(await getJson(username), today),
          stale: false,
          updatedAt: new Date(now()).toISOString(),
          profileUrl: `https://www.duolingo.com/profile/${encodeURIComponent(username)}`,
        };
        cache = { username, value, expiresAt: now() + ttlMs };
        return value;
      } catch (error) {
        if (error.code !== "invalid_config" && cache && cache.username === username) {
          cache = { ...cache, expiresAt: now() + 2 * 60 * 1000 };
          return { ...cache.value, stale: true };
        }
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return { get };
}
