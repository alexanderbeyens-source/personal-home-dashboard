import { mapSportsEvents } from "./data.js";
import { normalizeEspnNews } from "./news.js";

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_STANDINGS = "https://site.api.espn.com/apis/v2/sports";
const ESPN_GAMELOG = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";

const MINUTE = 60 * 1000;
const STANDINGS_TTL_MS = 15 * MINUTE;
const FIXTURES_TTL_MS = 5 * MINUTE;
const LIVE_FIXTURES_TTL_MS = MINUTE;
const NEWS_TTL_MS = 15 * MINUTE;
const PLAYERS_TTL_MS = 30 * MINUTE;
const NBA_WINDOW_DAYS = 3;

export const FOCUS_NBA_TEAMS = ["LAL", "POR", "OKC"];

export const SPORTS_LEAGUES = {
  nba: {
    id: "nba",
    label: "NBA",
    sport: "basketball",
    espn: "nba",
    standingsLink: "https://www.espn.com/nba/standings",
    focusGroup: "Western Conference",
  },
  "pro-league": {
    id: "pro-league",
    label: "Jupiler Pro League",
    sport: "soccer",
    espn: "bel.1",
    standingsLink: "https://www.espn.com/soccer/standings/_/league/bel.1",
    extraNewsSource: "sporza-belgian-football",
  },
  "premier-league": {
    id: "premier-league",
    label: "Premier League",
    sport: "soccer",
    espn: "eng.1",
    standingsLink: "https://www.premierleague.com/tables",
    extraNewsSource: "bbc-premier-league",
  },
};

const FEATURED_PLAYERS = [
  { name: "Toumani Camara", team: "por", match: /toumani camara/i },
  { name: "AJ Mitchell", team: "okc", match: /ajay mitchell|aj mitchell/i },
];

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statValue(entry, name) {
  const stat = (entry.stats ?? []).find((item) => item.name === name || item.type === name);
  return stat ? numberOrNull(stat.value ?? stat.displayValue) : null;
}

function statDisplay(entry, name) {
  const stat = (entry.stats ?? []).find((item) => item.name === name || item.type === name);
  return typeof stat?.displayValue === "string" ? stat.displayValue : null;
}

export function parseStandings(payload, league) {
  const groups = (payload.children?.length ? payload.children : [payload])
    .map((group) => {
      const entries = (group.standings?.entries ?? [])
        .map((entry) => {
          const team = entry.team ?? {};
          if (!team.displayName) return null;
          return {
            teamId: String(team.id ?? team.abbreviation ?? team.displayName),
            name: team.displayName,
            shortName: team.shortDisplayName ?? team.displayName,
            abbreviation: team.abbreviation ?? "",
            logo: team.logos?.[0]?.href ?? null,
            rank: statValue(entry, "rank") ?? statValue(entry, "playoffSeed"),
            gamesPlayed: statValue(entry, "gamesPlayed"),
            wins: statValue(entry, "wins"),
            losses: statValue(entry, "losses"),
            ties: statValue(entry, "ties"),
            points: league.sport === "soccer" ? statValue(entry, "points") : null,
            goalDifference: league.sport === "soccer" ? statValue(entry, "pointDifferential") : null,
            winPercent: league.sport === "basketball" ? statDisplay(entry, "winPercent") : null,
            gamesBehind: league.sport === "basketball" ? statDisplay(entry, "gamesBehind") : null,
            streak: league.sport === "basketball" ? statDisplay(entry, "streak") : null,
            focus: league.id === "nba" && FOCUS_NBA_TEAMS.includes(team.abbreviation),
          };
        })
        .filter(Boolean)
        .sort((first, second) => (first.rank ?? Infinity) - (second.rank ?? Infinity))
        .map((entry, index) => ({ ...entry, rank: entry.rank ?? index + 1 }));
      return { name: group.name ?? league.label, entries };
    })
    .filter((group) => group.entries.length > 0);
  if (!groups.length) throw new Error("Standings response contained no teams.");
  return groups;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayKey(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function fixtureRequestDates(league, currentTime) {
  const now = new Date(currentTime);
  if (league.sport === "basketball") {
    return Array.from({ length: NBA_WINDOW_DAYS * 2 + 1 }, (_, index) =>
      dayKey(new Date(currentTime + (index - NBA_WINDOW_DAYS) * 24 * 60 * MINUTE)));
  }
  const months = new Set([monthKey(now)]);
  if (now.getUTCDate() <= 10) months.add(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))));
  if (now.getUTCDate() >= 18) months.add(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15))));
  return [...months].sort();
}

export function splitFixtures(events) {
  const unique = new Map();
  for (const event of events) {
    if (!event.id || unique.has(event.id)) continue;
    // ESPN reports "0" for matches that have not started; never present that as a score.
    unique.set(event.id, event.state === "pre"
      ? { ...event, competitors: event.competitors.map((team) => ({ ...team, score: "", winner: false })) }
      : event);
  }
  const all = [...unique.values()];
  const time = (event) => Date.parse(event.date) || 0;
  return {
    live: all.filter((event) => event.state === "in").sort((a, b) => time(a) - time(b)),
    past: all.filter((event) => event.state === "post").sort((a, b) => time(b) - time(a)),
    upcoming: all.filter((event) => event.state === "pre").sort((a, b) => time(a) - time(b)),
  };
}

function involvesFocusTeam(event) {
  return event.competitors.some((team) => FOCUS_NBA_TEAMS.includes(team.abbreviation));
}

export function parseLatestGameLine(payload, player) {
  const labels = payload.labels ?? [];
  const regularSeason = (payload.seasonTypes ?? []).find((type) => /regular/i.test(type.displayName ?? "")) ?? payload.seasonTypes?.[0];
  const latest = (regularSeason?.categories ?? [])
    .flatMap((category) => category.events ?? [])
    .map((item) => ({ ...item, meta: payload.events?.[item.eventId] }))
    .filter((item) => item.meta?.gameDate && Array.isArray(item.stats))
    .sort((first, second) => Date.parse(second.meta.gameDate) - Date.parse(first.meta.gameDate))[0];
  if (!latest) return { ...player, lastGame: null };
  const stat = (label) => {
    const index = labels.indexOf(label);
    return index >= 0 ? latest.stats[index] ?? null : null;
  };
  return {
    ...player,
    lastGame: {
      date: latest.meta.gameDate,
      opponent: latest.meta.opponent?.displayName ?? null,
      atVs: latest.meta.atVs ?? null,
      result: latest.meta.gameResult ?? null,
      score: latest.meta.score ?? null,
      minutes: stat("MIN"),
      points: stat("PTS"),
      rebounds: stat("REB"),
      assists: stat("AST"),
      link: latest.meta.links?.find((link) => link.rel?.includes("summary"))?.href ?? null,
    },
  };
}

export function createSportsService({ fetchJson, loadExtraNews = async () => ({ articles: [], warnings: [] }), now = () => Date.now() }) {
  const cache = new Map();
  const inFlight = new Map();

  async function cached(key, ttlMs, loader, { refresh = false } = {}) {
    const entry = cache.get(key);
    const currentTime = now();
    if (!refresh && entry && currentTime - entry.fetchedAt < (typeof ttlMs === "function" ? ttlMs(entry.value) : ttlMs)) {
      return { value: entry.value, stale: false, fetchedAt: entry.fetchedAt, warning: null };
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const request = (async () => {
      try {
        const value = await loader();
        const fetchedAt = now();
        cache.set(key, { value, fetchedAt });
        return { value, stale: false, fetchedAt, warning: null };
      } catch {
        if (entry) return { value: entry.value, stale: true, fetchedAt: entry.fetchedAt, warning: "Vernieuwen mislukt; de laatste geslaagde gegevens worden getoond." };
        return { value: null, stale: false, fetchedAt: null, warning: "Bron tijdelijk niet beschikbaar." };
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, request);
    return request;
  }

  function leagueOrThrow(leagueId) {
    const league = SPORTS_LEAGUES[leagueId];
    if (!league) {
      const error = new Error("Onbekende competitie.");
      error.status = 404;
      throw error;
    }
    return league;
  }

  const loadStandings = (league, options) => cached(`standings:${league.id}`, STANDINGS_TTL_MS, async () =>
    parseStandings(await fetchJson(`${ESPN_STANDINGS}/${league.sport}/${league.espn}/standings`), league), options);

  const loadFixtures = (league, options) => cached(
    `fixtures:${league.id}`,
    (value) => (value?.live?.length ? LIVE_FIXTURES_TTL_MS : FIXTURES_TTL_MS),
    async () => {
      const dates = fixtureRequestDates(league, now());
      const results = await Promise.allSettled(dates.map((date) =>
        fetchJson(`${ESPN_SITE}/${league.sport}/${league.espn}/scoreboard?dates=${date}`)));
      const succeeded = results.filter((result) => result.status === "fulfilled");
      if (!succeeded.length) throw new Error("Fixtures unavailable.");
      return {
        ...splitFixtures(succeeded.flatMap((result) => mapSportsEvents(result.value))),
        partial: succeeded.length < results.length,
      };
    },
    options,
  );

  const loadNews = (league, options) => cached(`news:${league.id}`, NEWS_TTL_MS, async () => {
    const source = {
      id: `espn-${league.id}-news`,
      name: "ESPN",
      category: "sport",
      language: "en",
      kind: "journalism",
      url: `${ESPN_SITE}/${league.sport}/${league.espn}/news`,
    };
    const [espn, extra] = await Promise.allSettled([
      fetchJson(source.url).then((payload) => normalizeEspnNews(payload, source)),
      league.extraNewsSource ? loadExtraNews(league.extraNewsSource) : Promise.resolve({ articles: [] }),
    ]);
    const articles = [
      ...(extra.status === "fulfilled" ? extra.value.articles ?? [] : []),
      ...(espn.status === "fulfilled" ? espn.value : []),
    ];
    if (!articles.length && espn.status === "rejected" && extra.status === "rejected") throw new Error("News unavailable.");
    const seen = new Set();
    return articles
      .filter((article) => article.link && !seen.has(article.link) && seen.add(article.link))
      .sort((first, second) => (Date.parse(second.publishedAt) || 0) - (Date.parse(first.publishedAt) || 0))
      .slice(0, 12);
  }, options);

  const loadPlayers = (options) => cached("players:nba", PLAYERS_TTL_MS, async () => {
    const rosters = await Promise.allSettled(FEATURED_PLAYERS.map((player) =>
      fetchJson(`${ESPN_SITE}/basketball/nba/teams/${player.team}/roster`)));
    const players = await Promise.all(FEATURED_PLAYERS.map(async (player, index) => {
      const roster = rosters[index];
      if (roster.status === "rejected") return null;
      const athlete = roster.value.athletes?.find((item) => player.match.test(item.fullName ?? ""));
      if (!athlete?.id) return null;
      const base = {
        name: player.name,
        team: roster.value.team?.displayName ?? null,
        profile: athlete.links?.find((link) => link.rel?.includes("playercard"))?.href ?? null,
      };
      try {
        return parseLatestGameLine(await fetchJson(`${ESPN_GAMELOG}/${encodeURIComponent(athlete.id)}/gamelog`), base);
      } catch {
        return { ...base, lastGame: null };
      }
    }));
    const found = players.filter(Boolean);
    if (!found.length) throw new Error("Player data unavailable.");
    return found;
  }, options);

  function warningsFor(label, ...results) {
    return results
      .filter((result) => result.warning)
      .map((result) => ({ source: label, message: result.warning, stale: result.stale }));
  }

  function standingsSummary(league, groups) {
    if (!groups) return null;
    const group = groups.find((item) => item.name === league.focusGroup) ?? groups[0];
    const top = group.entries.slice(0, 5);
    const extra = group.entries.filter((entry) => entry.focus && !top.includes(entry));
    return { group: group.name, entries: [...top, ...extra.slice(0, 1)] };
  }

  async function overview(leagueId, { refresh = false } = {}) {
    const league = leagueOrThrow(leagueId);
    const [standings, fixtures, players] = await Promise.all([
      loadStandings(league, { refresh }),
      loadFixtures(league, { refresh }),
      league.id === "nba" ? loadPlayers({ refresh }) : Promise.resolve({ value: null, warning: null }),
    ]);
    if (!standings.value && !fixtures.value) {
      const error = new Error("Sportgegevens zijn tijdelijk niet beschikbaar.");
      error.status = 502;
      throw error;
    }
    const filter = league.id === "nba" ? involvesFocusTeam : () => true;
    const split = fixtures.value ?? { live: [], past: [], upcoming: [] };
    return {
      league: { id: league.id, label: league.label, standingsLink: league.standingsLink },
      live: split.live.filter(filter).slice(0, 3),
      past: split.past.filter(filter).slice(0, 3),
      upcoming: split.upcoming.filter(filter).slice(0, 3),
      standings: standingsSummary(league, standings.value),
      players: players.value ?? [],
      stale: Boolean(standings.stale || fixtures.stale),
      fetchedAt: Math.min(...[standings.fetchedAt, fixtures.fetchedAt].filter(Boolean)) || null,
      warnings: warningsFor(league.label, standings, fixtures, players),
    };
  }

  async function detail(leagueId, { refresh = false } = {}) {
    const league = leagueOrThrow(leagueId);
    const [standings, fixtures, news, players] = await Promise.all([
      loadStandings(league, { refresh }),
      loadFixtures(league, { refresh }),
      loadNews(league, { refresh }),
      league.id === "nba" ? loadPlayers({ refresh }) : Promise.resolve({ value: null, warning: null }),
    ]);
    if (!standings.value && !fixtures.value && !news.value) {
      const error = new Error("Sportgegevens zijn tijdelijk niet beschikbaar.");
      error.status = 502;
      throw error;
    }
    const split = fixtures.value ?? { live: [], past: [], upcoming: [] };
    return {
      league: { id: league.id, label: league.label, standingsLink: league.standingsLink },
      live: split.live,
      past: split.past.slice(0, 20),
      upcoming: split.upcoming.slice(0, 20),
      standings: standings.value ?? [],
      news: news.value ?? [],
      players: players.value ?? [],
      stale: Boolean(standings.stale || fixtures.stale || news.stale),
      warnings: warningsFor(league.label, standings, fixtures, news, players),
    };
  }

  return { overview, detail };
}
