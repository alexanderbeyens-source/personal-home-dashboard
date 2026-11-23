import { describe, expect, it, vi } from "vitest";
import { loadNbaData, loadNbaPlayers, mapSportsEvents, parseRss } from "./data.js";

describe("parseRss", () => {
  it("uses the supplied feed source and leaves absent or invalid dates unset", () => {
    const xml = `
      <rss><channel>
        <item><title>First &amp; foremost</title><link>https://example.com/first</link></item>
        <item><title>Second</title><pubDate>not a real date</pubDate><link>https://example.com/second</link></item>
        <item><title>Missing link</title></item>
      </channel></rss>`;

    expect(parseRss(xml, 8, "BBC News")).toEqual([
      {
        title: "First & foremost",
        link: "https://example.com/first",
        source: "BBC News",
        publishedAt: null,
      },
      {
        title: "Second",
        link: "https://example.com/second",
        source: "BBC News",
        publishedAt: null,
      },
    ]);
  });

  it("keeps the configured publisher as the source even when an item has author metadata", () => {
    const xml = `<rss><channel><item><title>Story</title><link>https://example.com/story</link><source>Original Source</source><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    const [article] = parseRss(xml, 8, "BBC News");

    expect(article.source).toBe("BBC News");
    expect(article.publishedAt).toBe("2026-11-23T10:00:00.000Z");
  });
});

describe("NBA data loading", () => {
  it("loads the scoreboard without waiting for roster endpoints", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("/scoreboard")) {
        return {
          events: [{
            id: "game-1",
            name: "Away at Home",
            date: "2026-11-23T19:00:00Z",
            status: { type: { state: "in", description: "In Progress", shortDetail: "Q2 4:00" } },
            competitions: [{ competitors: [] }],
          }],
        };
      }
      return { articles: [] };
    });

    const result = await loadNbaData(fetchJson);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].state).toBe("in");
    expect(fetchJson.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      expect.stringContaining("/scoreboard"),
      expect.stringContaining("/news"),
    ]));
    expect(fetchJson.mock.calls.every(([url]) => !url.includes("/roster"))).toBe(true);
  });

  it("reports unavailable roster data without failing player results", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("/por/roster")) throw new Error("Roster service unavailable");
      return {
        team: { displayName: "Oklahoma City Thunder" },
        athletes: [{
          fullName: "Ajay Mitchell",
          links: [{ rel: ["playercard"], href: "https://www.espn.com/nba/player/_/id/1" }],
        }],
      };
    });

    const result = await loadNbaPlayers(fetchJson);

    expect(result.featuredPlayers).toEqual([
      {
        name: "AJ Mitchell",
        team: "Oklahoma City Thunder",
        url: "https://www.espn.com/nba/player/_/id/1",
      },
    ]);
    expect(result.warnings).toContain("Some featured player profiles are temporarily unavailable.");
  });

  it("reports a scoreboard failure rather than returning success-shaped empty data", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.includes("/scoreboard")) throw new Error("Scoreboard unavailable");
      return {};
    });

    await expect(loadNbaData(fetchJson)).rejects.toThrow("Scoreboard unavailable");
  });

  it("keeps NBA scores available when the optional headlines request fails", async () => {
    const fetchJson = vi.fn(async () => ({
      events: [{ id: "game-1", name: "Away at Home", date: "2026-11-23T19:00:00Z" }],
    }));

    const result = await loadNbaData(fetchJson, async () => {
      throw new Error("Headlines unavailable");
    });

    expect(result.events).toHaveLength(1);
    expect(result.news).toEqual([]);
    expect(result.warnings).toContain("NBA headlines are temporarily unavailable.");
  });
});

describe("mapSportsEvents", () => {
  it("preserves live, completed, and upcoming states without inventing missing details", () => {
    const [live, completed, upcoming, incomplete] = mapSportsEvents({
      events: [
        { id: "live", date: "2026-11-23T19:00:00Z", status: { type: { state: "in", description: "In Progress", shortDetail: "Q2" } } },
        { id: "completed", date: "2026-11-22T19:00:00Z", status: { type: { state: "post", description: "Final", shortDetail: "Final" } } },
        { id: "upcoming", date: "2026-11-24T19:00:00Z", status: { type: { state: "pre", description: "Scheduled", shortDetail: "7:00 PM" } } },
        { id: "incomplete" },
      ],
    });

    expect([live.state, completed.state, upcoming.state]).toEqual(["in", "post", "pre"]);
    expect(incomplete).toMatchObject({
      date: "",
      state: null,
      status: "Status unavailable",
      shortStatus: "Status unavailable",
      competitors: [],
    });
  });
});
