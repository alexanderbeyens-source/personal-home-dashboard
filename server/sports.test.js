import { describe, expect, it, vi } from "vitest";
import {
  SPORTS_LEAGUES,
  createSportsService,
  fixtureRequestDates,
  parseLatestGameLine,
  parseStandings,
  splitFixtures,
} from "./sports.js";

const stat = (name, value, displayValue = String(value)) => ({ name, value, displayValue });

function soccerStandings() {
  return {
    children: [{
      name: "Pro League",
      standings: {
        entries: [
          { team: { id: "2", displayName: "Club Brugge", abbreviation: "CLB" }, stats: [stat("rank", 2), stat("points", 31), stat("gamesPlayed", 12), stat("pointDifferential", 18)] },
          { team: { id: "1", displayName: "Union St.-Gilloise", abbreviation: "USG" }, stats: [stat("rank", 1), stat("points", 32), stat("gamesPlayed", 12), stat("pointDifferential", 24)] },
        ],
      },
    }],
  };
}

function nbaStandings() {
  const team = (abbreviation, seed, wins, losses) => ({
    team: { id: abbreviation, displayName: `${abbreviation} team`, abbreviation },
    stats: [stat("playoffSeed", seed), stat("wins", wins), stat("losses", losses), stat("winPercent", wins / (wins + losses), ".500")],
  });
  return {
    children: [
      { name: "Eastern Conference", standings: { entries: [team("BOS", 1, 14, 4)] } },
      {
        name: "Western Conference",
        standings: {
          entries: [
            team("SA", 1, 15, 3), team("LAL", 2, 15, 3), team("MIN", 3, 13, 5), team("HOU", 4, 13, 5),
            team("MEM", 5, 13, 5), team("DEN", 6, 12, 6), team("POR", 7, 11, 6), team("OKC", 9, 9, 9),
          ],
        },
      },
    ],
  };
}

function scoreboard(events) {
  return {
    events: events.map(([id, date, state, home, away, homeScore = "0", awayScore = "0"]) => ({
      id,
      date,
      name: `${away} at ${home}`,
      status: { type: { state, description: state, shortDetail: state } },
      competitions: [{
        competitors: [
          { homeAway: "home", score: homeScore, team: { displayName: home, abbreviation: home } },
          { homeAway: "away", score: awayScore, team: { displayName: away, abbreviation: away } },
        ],
      }],
    })),
  };
}

describe("sports standings and fixtures", () => {
  it("orders soccer standings by rank and keeps points and goal difference", () => {
    const [group] = parseStandings(soccerStandings(), SPORTS_LEAGUES["pro-league"]);
    expect(group.name).toBe("Pro League");
    expect(group.entries.map(({ abbreviation, rank, points, goalDifference }) => [abbreviation, rank, points, goalDifference]))
      .toEqual([["USG", 1, 32, 24], ["CLB", 2, 31, 18]]);
  });

  it("orders NBA conferences by playoff seed and marks followed teams", () => {
    const groups = parseStandings(nbaStandings(), SPORTS_LEAGUES.nba);
    const west = groups.find(({ name }) => name === "Western Conference");
    expect(west.entries.slice(0, 2).map(({ abbreviation }) => abbreviation)).toEqual(["SA", "LAL"]);
    expect(west.entries.filter(({ focus }) => focus).map(({ abbreviation }) => abbreviation)).toEqual(["LAL", "POR", "OKC"]);
    expect(west.entries[0].points).toBeNull();
  });

  it("requests whole months for soccer and a seven-day window for the NBA", () => {
    const lateNovember = Date.parse("2026-11-24T10:00:00Z");
    expect(fixtureRequestDates(SPORTS_LEAGUES["premier-league"], lateNovember)).toEqual(["202611", "202612"]);
    expect(fixtureRequestDates(SPORTS_LEAGUES["premier-league"], Date.parse("2026-11-05T10:00:00Z"))).toEqual(["202610", "202611"]);
    expect(fixtureRequestDates(SPORTS_LEAGUES.nba, lateNovember)).toEqual([
      "20261121", "20261122", "20261123", "20261124", "20261125", "20261126", "20261127",
    ]);
  });

  it("splits fixtures, removes duplicates and never shows a score before kick-off", () => {
    const events = [
      { id: "a", date: "2026-11-20T15:00Z", state: "post", competitors: [{ score: "2" }, { score: "1" }] },
      { id: "b", date: "2026-11-22T15:00Z", state: "post", competitors: [{ score: "0" }, { score: "0" }] },
      { id: "c", date: "2026-11-29T15:00Z", state: "pre", competitors: [{ score: "0", winner: false }, { score: "0", winner: false }] },
      { id: "c", date: "2026-11-29T15:00Z", state: "pre", competitors: [] },
      { id: "d", date: "2026-11-24T15:00Z", state: "in", competitors: [{ score: "1" }, { score: "0" }] },
    ];
    const split = splitFixtures(events);
    expect(split.past.map(({ id }) => id)).toEqual(["b", "a"]);
    expect(split.past[0].competitors.map(({ score }) => score)).toEqual(["0", "0"]);
    expect(split.upcoming).toHaveLength(1);
    expect(split.upcoming[0].competitors.map(({ score }) => score)).toEqual(["", ""]);
    expect(split.live.map(({ id }) => id)).toEqual(["d"]);
  });

  it("extracts the most recent regular-season game line", () => {
    const line = parseLatestGameLine({
      labels: ["MIN", "REB", "AST", "PTS"],
      events: {
        old: { gameDate: "2026-11-20T00:00:00Z", opponent: { displayName: "Utah Jazz" }, gameResult: "W", score: "110-100" },
        recent: { gameDate: "2026-11-24T00:00:00Z", opponent: { displayName: "Philadelphia 76ers" }, atVs: "@", gameResult: "W", score: "128-111" },
      },
      seasonTypes: [{ displayName: "2026-27 Regular Season", categories: [{ events: [
        { eventId: "old", stats: ["20", "2", "1", "8"] },
        { eventId: "recent", stats: ["29", "5", "3", "5"] },
      ] }] }],
    }, { name: "Toumani Camara" });
    expect(line.lastGame).toMatchObject({ opponent: "Philadelphia 76ers", result: "W", minutes: "29", points: "5", rebounds: "5", assists: "3" });
  });

  it("returns a player without a game line instead of inventing one", () => {
    expect(parseLatestGameLine({ labels: [], events: {}, seasonTypes: [] }, { name: "AJ Mitchell" }).lastGame).toBeNull();
  });
});

describe("sports service", () => {
  const currentTime = Date.parse("2026-11-24T10:00:00Z");

  function nbaFetch() {
    return vi.fn(async (url) => {
      if (url.includes("/standings")) return nbaStandings();
      if (url.includes("/roster")) return { athletes: [], team: { displayName: "Team" } };
      if (url.includes("scoreboard?dates=20261123")) {
        return scoreboard([
          ["g1", "2026-11-24T03:00Z", "post", "LAL", "UTAH", "109", "94"],
          ["g2", "2026-11-24T01:00Z", "post", "HOU", "LAC", "116", "104"],
        ]);
      }
      if (url.includes("scoreboard?dates=20261126")) return scoreboard([["g3", "2026-11-26T03:00Z", "pre", "POR", "SA"]]);
      return { events: [] };
    });
  }

  it("builds an NBA overview around the Lakers and Belgian players' teams", async () => {
    const service = createSportsService({ fetchJson: nbaFetch(), now: () => currentTime });
    const overview = await service.overview("nba");

    expect(overview.past.map(({ id }) => id)).toEqual(["g1"]);
    expect(overview.upcoming.map(({ id }) => id)).toEqual(["g3"]);
    expect(overview.upcoming[0].competitors.map(({ score }) => score)).toEqual(["", ""]);
    expect(overview.standings.name).toBe("Western Conference");
    expect(overview.standings.entries.map(({ abbreviation }) => abbreviation)).toEqual(["SA", "LAL", "MIN", "HOU", "MEM", "POR"]);
    expect(overview.warnings).toEqual([{ source: "NBA", message: "Bron tijdelijk niet beschikbaar.", stale: false }]);
  });

  it("keeps the last successful standings when a refresh fails", async () => {
    let fail = false;
    const fetchJson = vi.fn(async (url) => {
      if (fail) throw new Error("HTTP 503");
      if (url.includes("/standings")) return soccerStandings();
      return scoreboard([["m1", "2026-11-22T15:00Z", "post", "USG", "CLB", "2", "1"]]);
    });
    const service = createSportsService({ fetchJson, now: () => currentTime });
    await service.overview("pro-league");
    fail = true;
    const refreshed = await service.overview("pro-league", { refresh: true });

    expect(refreshed.standings.entries[0].abbreviation).toBe("USG");
    expect(refreshed.past.map(({ id }) => id)).toEqual(["m1"]);
    expect(refreshed.stale).toBe(true);
    expect(refreshed.warnings.every(({ stale }) => stale)).toBe(true);
  });

  it("merges competition news from ESPN and the existing feed, newest first", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.endsWith("/news")) {
        return { articles: [{ headline: "ESPN story", links: { web: { href: "https://www.espn.com/story/1" } }, published: "2026-11-23T10:00:00Z" }] };
      }
      if (url.includes("/standings")) return soccerStandings();
      return { events: [] };
    });
    const loadExtraNews = vi.fn(async () => ({
      articles: [{ title: "Sporza verslag", link: "https://sporza.be/a", source: "Sporza", publishedAt: "2026-11-24T08:00:00Z" }],
    }));
    const service = createSportsService({ fetchJson, loadExtraNews, now: () => currentTime });
    const detail = await service.detail("pro-league");

    expect(loadExtraNews).toHaveBeenCalledWith("sporza-belgian-football");
    expect(detail.news.map(({ title }) => title)).toEqual(["Sporza verslag", "ESPN story"]);
  });

  it("rejects unknown competitions", async () => {
    const service = createSportsService({ fetchJson: vi.fn(), now: () => currentTime });
    await expect(service.overview("serie-a")).rejects.toMatchObject({ status: 404 });
  });
});
