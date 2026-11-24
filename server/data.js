import { NEWS_SOURCES, normalizeEspnNews, parseFeedXml } from "./news.js";

const nbaNewsSource = NEWS_SOURCES.find((source) => source.id === "espn-nba-news");

export function parseRss(xml, limit = 8, fallbackSource = "Live feed") {
  return parseFeedXml(xml, {
    id: "legacy-feed",
    name: fallbackSource,
    category: "international",
    language: "en",
    kind: "journalism",
    url: "https://example.com/feed.xml",
  }, limit).map(({ title, link, publishedAt }) => ({
    title,
    link,
    source: fallbackSource,
    publishedAt,
  }));
}

export function mapSportsEvents(payload) {
  return (payload.events ?? []).map((event) => {
    const competition = event.competitions?.[0];
    const state = ["pre", "in", "post"].includes(event.status?.type?.state)
      ? event.status.type.state
      : null;
    return {
      id: event.id,
      name: event.name,
      date: typeof event.date === "string" ? event.date : "",
      state,
      status: event.status?.type?.description ?? "Status niet beschikbaar",
      shortStatus: event.status?.type?.shortDetail ?? event.status?.type?.detail ?? "Status niet beschikbaar",
      competitors: (competition?.competitors ?? []).map((competitor) => ({
        name: competitor.team?.displayName ?? competitor.team?.name ?? "Team",
        abbreviation: competitor.team?.abbreviation ?? "—",
        score: competitor.score === null || competitor.score === undefined || competitor.score === ""
          ? ""
          : String(competitor.score),
        homeAway: competitor.homeAway ?? "",
        logo: competitor.team?.logo ?? null,
        winner: Boolean(competitor.winner),
      })),
    };
  });
}

export async function loadNbaData(fetchJson, fetchNews = async () => ({
  articles: normalizeEspnNews(await fetchJson(nbaNewsSource.url), nbaNewsSource),
  warnings: [],
})) {
  const [scoreboardResult, newsResult] = await Promise.allSettled([
    fetchJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=30"),
    fetchNews(),
  ]);
  if (scoreboardResult.status === "rejected") throw scoreboardResult.reason;

  const warnings = [];
  if (newsResult.status === "rejected") {
    warnings.push("NBA-nieuws is tijdelijk niet beschikbaar.");
  } else {
    warnings.push(...(newsResult.value.warnings ?? []));
  }
  const news = newsResult.status === "fulfilled" ? newsResult.value.articles.slice(0, 8) : [];

  return {
    events: mapSportsEvents(scoreboardResult.value),
    news,
    warnings,
  };
}

export async function loadNbaPlayers(fetchJson) {
  const endpoints = [
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/por/roster",
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/okc/roster",
  ];
  const rosterResults = await Promise.allSettled(endpoints.map((endpoint) => fetchJson(endpoint)));
  const warnings = [];
  const rosterPlayers = rosterResults.map((result, index) => {
    if (result.status === "rejected") {
      warnings.push("Sommige spelersprofielen zijn tijdelijk niet beschikbaar.");
      return null;
    }
    const roster = result.value;
    const isPortland = index === 0;
    const name = isPortland ? "Toumani Camara" : "AJ Mitchell";
    const athlete = roster.athletes?.find((player) =>
      isPortland
        ? /toumani camara/i.test(player.fullName ?? "")
        : /ajay mitchell/i.test(player.fullName ?? ""),
    );
    const profile = athlete?.links?.find((link) => link.rel?.includes("playercard"))?.href;
    if (!athlete || !profile || !roster.team?.displayName) {
      warnings.push("Sommige spelersprofielen zijn tijdelijk niet beschikbaar.");
      return null;
    }
    return { name, team: roster.team.displayName, url: profile };
  }).filter(Boolean);

  return {
    featuredPlayers: rosterPlayers,
    warnings: [...new Set(warnings)],
  };
}

