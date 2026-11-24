import { describe, expect, it, vi } from "vitest";
import {
  NEWS_CATEGORIES,
  NEWS_SOURCES,
  canonicalizeUrl,
  isAllowedFeedContentType,
  createNewsService,
  deduplicateArticles,
  normalizeEspnNews,
  parseFeedXml,
  articleRelevanceScore,
  selectBriefingArticles,
} from "./news.js";

const source = {
  id: "vrt",
  name: "VRT NWS",
  category: "belgium",
  language: "nl",
  kind: "journalism",
  format: "xml",
  url: "https://example.com/feed.xml",
};

function rssItem({ title = "A headline", link = "https://example.com/story", date = "Mon, 23 Nov 2026 10:00:00 GMT" } = {}) {
  return `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
}

function rssFeed(items) {
  return `<rss version="2.0"><channel><title>Test</title>${items.join("")}</channel></rss>`;
}

function makeService({ sources = [source], fetchXml, now, ttlMs, retryMs } = {}) {
  return createNewsService({
    fetchXml: fetchXml ?? (async () => rssFeed([rssItem()])),
    fetchJson: async () => ({ articles: [] }),
    sources,
    categories: NEWS_CATEGORIES,
    now,
    ttlMs,
    retryMs,
    onSourceError: vi.fn(),
  });
}

describe("news feed parsing", () => {
  it("uses five categories and keeps software sources in Technology & AI", () => {
    expect(NEWS_CATEGORIES.map(({ id }) => id)).toEqual([
      "belgium",
      "international",
      "technology-ai",
      "economy-business",
      "sport",
    ]);
    expect(NEWS_SOURCES.find(({ id }) => id === "simon-willison").category).toBe("technology-ai");
    expect(NEWS_SOURCES.find(({ id }) => id === "github-changelog").category).toBe("technology-ai");
    expect(NEWS_SOURCES.some(({ category }) => category === "data-software")).toBe(false);
  });

  it("parses RSS text, entities, dates, and valid original links", () => {
    const xml = rssFeed([
      rssItem({
        title: "First &amp; foremost",
        link: "https://news.example/story?id=42&amp;utm_source=feed",
      }),
    ]);

    expect(parseFeedXml(xml, source)).toMatchObject([
      {
        title: "First & foremost",
        link: "https://news.example/story?id=42&utm_source=feed",
        source: "VRT NWS",
        sourceKind: "journalism",
        publishedAt: "2026-11-23T10:00:00.000Z",
      },
    ]);
  });

  it("parses Atom alternate links and namespace-prefixed dates", () => {
    const atom = `
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <entry>
          <title><![CDATA[Atom headline]]></title>
          <link rel="self" href="https://example.com/api/item/4" />
          <link rel="alternate" href="https://example.com/story/4" />
          <dc:date>2026-11-23T11:30:00Z</dc:date>
        </entry>
      </feed>`;

    expect(parseFeedXml(atom, source)).toMatchObject([
      {
        title: "Atom headline",
        link: "https://example.com/story/4",
        publishedAt: "2026-11-23T11:30:00.000Z",
      },
    ]);
  });

  it("uses declared languages and keeps only configured Sporza football tags", () => {
    const sporza = {
      ...source,
      id: "sporza",
      name: "Sporza",
      category: "sport",
      language: "nl",
      includeTags: ["Jupiler Pro League", "Rode Duivels"],
    };
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:vrtns="http://base.vrt.be" xml:lang="nl">
      <entry><title>JPL match report</title><link rel="alternate" href="https://sporza.example/jpl" />
        <published>2026-11-23T10:00:00Z</published><summary>A readable match description</summary>
        <vrtns:nstag>voetbal|Jupiler Pro League|Anderlecht</vrtns:nstag></entry>
      <entry><title>Red Devils squad update</title><link rel="alternate" href="https://sporza.example/reds" />
        <published>2026-11-23T10:30:00Z</published><vrtns:nstag>voetbal|Rode Duivels|België</vrtns:nstag></entry>
      <entry><title>General cycling story</title><link rel="alternate" href="https://sporza.example/cycling" />
        <published>2026-11-23T11:00:00Z</published><vrtns:nstag>wielrennen|Cycling</vrtns:nstag></entry>
    </feed>`;

    expect(parseFeedXml(atom, sporza)).toMatchObject([
      {
        title: "JPL match report",
        source: "Sporza",
        language: "nl",
        description: "A readable match description",
        sportGroup: "jupiler-pro-league",
        tags: ["voetbal", "Jupiler Pro League", "Anderlecht"],
      },
      {
        title: "Red Devils squad update",
        sportGroup: "red-devils",
        tags: ["voetbal", "Rode Duivels", "België"],
      },
    ]);
  });

  it("omits items with missing titles or invalid links and leaves invalid dates unset", () => {
    const xml = rssFeed([
      rssItem({ title: "No date", date: "not a date" }),
      rssItem({ title: "", link: "https://example.com/no-title" }),
      rssItem({ title: "Unsafe link", link: "javascript:alert(1)" }),
    ]);

    expect(parseFeedXml(xml, source)).toMatchObject([
      { title: "No date", publishedAt: null },
    ]);
  });

  it("rejects malformed XML and document entity declarations", () => {
    expect(() => parseFeedXml("<rss><channel><item></channel></rss>", source)).toThrow(/valid XML/);
    expect(() => parseFeedXml('<!DOCTYPE rss [<!ENTITY x "x">]><rss/>', source)).toThrow(/unsupported XML/);
  });

  it("accepts only ESPN items with an original web link", () => {
    expect(normalizeEspnNews({
      articles: [
        { headline: "Story", published: "2026-11-23T10:00:00Z", links: { web: { href: "https://espn.example/story" } } },
        { headline: "No original link", links: { api: { news: { href: "https://api.espn.example/item" } } } },
      ],
    }, { ...source, id: "espn", name: "ESPN", category: "sport" })).toMatchObject([
      { title: "Story", link: "https://espn.example/story" },
    ]);
  });
});

describe("news article deduplication", () => {
  function article(overrides = {}) {
    return {
      id: "https://example.com/story",
      title: "A verified headline with enough detail",
      link: "https://example.com/story",
      sourceId: "bbc",
      source: "BBC News",
      sourceKind: "journalism",
      category: "international",
      language: "en",
      publishedAt: "2026-11-23T10:00:00.000Z",
      coverage: [],
      ...overrides,
    };
  }

  it("removes tracking parameters but preserves meaningful query parameters", () => {
    expect(canonicalizeUrl("https://example.com/story?id=3&utm_campaign=test&fbclid=abc#top"))
      .toBe("https://example.com/story?id=3");
    const result = deduplicateArticles([
      article({ link: "https://example.com/story?id=3&utm_source=bbc" }),
      article({
        id: "https://another.example/story",
        sourceId: "guardian",
        source: "The Guardian",
        link: "https://example.com/story?id=3&gclid=tracking",
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].coverage).toHaveLength(2);
  });

  it("does not merge separate developments just because their titles are similar", () => {
    const result = deduplicateArticles([
      article({ title: "Company announces a new product", publishedAt: "2026-11-23T10:00:00.000Z" }),
      article({ title: "Company announces a new product", publishedAt: "2026-11-28T10:00:00.000Z", link: "https://example.com/another" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("merges near-identical titles only within a short publication window", () => {
    const shared = "Independent researchers uncover vulnerability affecting widely used cloud storage system following comprehensive security audit published early Monday by technical experts worldwide";
    const result = deduplicateArticles([
      article({ title: shared, link: "https://bbc.example/story" }),
      article({
        title: shared.replace("comprehensive", "thorough"),
        sourceId: "guardian",
        source: "The Guardian",
        link: "https://guardian.example/story",
        publishedAt: "2026-11-23T10:30:00.000Z",
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].coverage).toHaveLength(2);
  });
});

describe("news service caching, isolation, and filters", () => {
  it("deduplicates concurrent requests to the same feed", async () => {
    let resolveFeed;
    const fetchXml = vi.fn(() => new Promise((resolve) => { resolveFeed = resolve; }));
    const service = makeService({ fetchXml });

    const first = service.query({ category: "belgium", since: "all" });
    const second = service.query({ category: "belgium", since: "all" });
    await vi.waitFor(() => expect(fetchXml).toHaveBeenCalledTimes(1));
    resolveFeed(rssFeed([rssItem()]));

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { articles: [{ title: "A headline" }] },
      { articles: [{ title: "A headline" }] },
    ]);
  });

  it("keeps stale data after a failed refresh and reports the last successful time", async () => {
    let currentTime = Date.parse("2026-11-23T10:00:00.000Z");
    const fetchXml = vi.fn()
      .mockResolvedValueOnce(rssFeed([rssItem()]))
      .mockRejectedValueOnce(new Error("network unavailable"));
    const service = makeService({
      fetchXml,
      now: () => currentTime,
      ttlMs: 100,
      retryMs: 60_000,
    });

    const initial = await service.query({ category: "belgium", since: "all" });
    const cached = await service.query({ category: "belgium", since: "all" });
    currentTime += 101;
    const refreshed = await service.query({ category: "belgium", since: "all" });
    const retriedDuringBackoff = await service.query({ category: "belgium", since: "all" });

    expect(initial.articles).toHaveLength(1);
    expect(cached.feedStatus[0].fetchedAt).toBe(initial.feedStatus[0].fetchedAt);
    expect(refreshed).toMatchObject({
      articles: [{ title: "A headline" }],
      stale: true,
      warnings: [{ stale: true, fetchedAt: "2026-11-23T10:00:00.000Z" }],
    });
    expect(retriedDuringBackoff.articles).toHaveLength(1);
    expect(fetchXml).toHaveBeenCalledTimes(2);
  });

  it("isolates failed feeds while returning successful feed articles", async () => {
    const sources = [
      source,
      { ...source, id: "rtbf", name: "RTBF Belgique", language: "fr", url: "https://rtbf.example/feed.xml" },
    ];
    const service = makeService({
      sources,
      fetchXml: vi.fn(async (itemSource) => {
        if (itemSource.id === "rtbf") throw new Error("unavailable");
        return rssFeed([rssItem()]);
      }),
    });

    const response = await service.query({ category: "belgium", since: "all" });
    expect(response.articles).toHaveLength(1);
    expect(response.warnings).toMatchObject([{ sourceId: "rtbf", stale: false }]);
    expect(response.feedStatus).toHaveLength(2);
  });

  it("keeps VRT NWS as the active Belgian source and RTBF absent", () => {
    const belgianSources = NEWS_SOURCES.filter(({ category, enabled }) => category === "belgium" && enabled !== false);
    expect(belgianSources.map(({ id }) => id)).toEqual(["vrt-nws"]);
    expect(belgianSources[0]).toMatchObject({ language: "nl", url: "https://www.vrt.be/vrtnws/nl.rss.headlines.xml" });
    expect(NEWS_SOURCES.some(({ id }) => id.startsWith("rtbf"))).toBe(false);
  });

  it("skips disabled sources entirely", async () => {
    const disabledVrt = { ...source, id: "vrt-nws", name: "VRT NWS", enabled: false };
    const fetchXml = vi.fn(async (itemSource) => rssFeed([
      rssItem({
        title: `${itemSource.name} headline`,
        link: `https://${itemSource.id}.example/story`,
      }),
    ]));
    const service = makeService({ sources: [disabledVrt], fetchXml });

    const categoryResponse = await service.query({ category: "belgium", since: "all" });
    const briefingResponse = await service.query({ view: "briefing", since: "all" });

    expect(categoryResponse.articles).toEqual([]);
    expect(briefingResponse.articles).toEqual([]);
    expect(categoryResponse.sources).toEqual([]);
    expect(fetchXml).not.toHaveBeenCalled();
  });

  it("excludes French Belgian stories and reports when language metadata is unknown", async () => {
    const sources = [
      { ...source, id: "french", name: "French feed", language: "en" },
      { ...source, id: "unknown", name: "Unspecified feed", language: undefined },
    ];
    const service = makeService({
      sources,
      fetchXml: async (itemSource) => itemSource.id === "french"
        ? `<rss><channel><language>fr-FR</language>${rssItem({ link: "https://example.com/fr" })}</channel></rss>`
        : rssFeed([rssItem({ link: "https://example.com/unknown" })]),
    });

    const response = await service.query({ category: "belgium", since: "all" });

    expect(response.articles).toEqual([]);
    expect(response.warnings).toMatchObject([
      { sourceId: "unknown", message: expect.stringContaining("unknown language metadata") },
    ]);
  });

  it("surfaces timeout and HTTP failures as isolated source warnings", async () => {
    const sources = [
      source,
      { ...source, id: "rtbf", name: "RTBF Belgique", language: "fr", url: "https://rtbf.example/feed.xml" },
    ];
    const service = makeService({
      sources,
      fetchXml: async (itemSource) => {
        if (itemSource.id === "vrt") throw new Error("HTTP 503");
        const timeout = new Error("deadline exceeded");
        timeout.name = "TimeoutError";
        throw timeout;
      },
    });

    const response = await service.query({ category: "belgium", since: "all" });

    expect(response.articles).toEqual([]);
    expect(response.warnings.map(({ sourceId }) => sourceId)).toEqual(["vrt", "rtbf"]);
  });

  it("marks a successfully fetched feed as stale when its newest article is old", async () => {
    const service = makeService({
      fetchXml: async () => rssFeed([rssItem({ date: "Mon, 01 Nov 2026 10:00:00 GMT" })]),
      now: () => Date.parse("2026-11-23T12:00:00.000Z"),
    });

    const response = await service.query({ category: "belgium", since: "all" });

    expect(response.feedStatus[0].contentStale).toBe(true);
    expect(response.warnings).toMatchObject([
      { stale: false, latestPublishedAt: "2026-11-01T10:00:00.000Z" },
    ]);
  });

  it("filters by category, source, and recency, and enforces response limits", async () => {
    const secondSource = {
      ...source,
      id: "bbc-alt",
      name: "Second source",
      language: "en",
      url: "https://second.example/feed.xml",
    };
    const service = makeService({
      sources: [source, secondSource],
      fetchXml: async (itemSource) => rssFeed([
        rssItem({
          title: itemSource.id === "vrt" ? "Recent VRT story" : "Recent RTBF story",
          link: `https://${itemSource.id}.example/recent`,
          date: "Mon, 23 Nov 2026 10:00:00 GMT",
        }),
        rssItem({
          title: `Old ${itemSource.id} story`,
          link: `https://${itemSource.id}.example/old`,
          date: "Mon, 01 Nov 2026 10:00:00 GMT",
        }),
      ]),
      now: () => Date.parse("2026-11-23T12:00:00.000Z"),
    });

    const response = await service.query({ category: "belgium", since: "24h", limit: 1 });
    const fromSource = await service.query({ category: "belgium", sourceId: "bbc-alt", since: "all", sort: "recent" });
    await expect(service.query({ category: "unknown" })).rejects.toMatchObject({ status: 400 });
    await expect(service.query({ category: "belgium", limit: 21 })).rejects.toMatchObject({ status: 400 });

    expect(response.articles).toHaveLength(1);
    expect(response.availableCount).toBe(2);
    expect(response.hasMore).toBe(true);
    expect(fromSource.articles.every((article) => article.sourceId === "bbc-alt")).toBe(true);
    expect(fromSource.articles[0].link).toBe("https://bbc-alt.example/recent");
    expect(fromSource.sources.every((item) => !("url" in item))).toBe(true);
  });

  it("sorts by relevance by default and supports chronological recency", async () => {
    const service = makeService({
      fetchXml: async () => rssFeed([
        rssItem({
          title: "A routine local update",
          link: "https://example.com/recent",
          date: "Mon, 23 Nov 2026 11:00:00 GMT",
        }),
        rssItem({
          title: "Ceasefire agreement reached after negotiations",
          link: "https://example.com/important",
          date: "Sat, 21 Nov 2026 12:00:00 GMT",
        }),
      ]),
      now: () => Date.parse("2026-11-23T12:00:00.000Z"),
    });

    const relevant = await service.query({ category: "belgium", since: "all" });
    const recent = await service.query({ category: "belgium", since: "all", sort: "recent" });

    expect(relevant.articles[0].title).toBe("Ceasefire agreement reached after negotiations");
    expect(recent.articles[0].title).toBe("A routine local update");
    await expect(service.query({ category: "belgium", sort: "other" })).rejects.toMatchObject({ status: 400 });
  });

  it("defaults category views to five stories and supports a bounded larger view", async () => {
    const service = makeService({
      fetchXml: async () => rssFeed(Array.from({ length: 8 }, (_, index) => rssItem({
        title: `Headline ${index}`,
        link: `https://example.com/story/${index}`,
      }))),
    });

    const defaultView = await service.query({ category: "belgium", since: "all" });
    const largerView = await service.query({ category: "belgium", since: "all", limit: 20 });

    expect(defaultView.articles).toHaveLength(5);
    expect(defaultView.hasMore).toBe(true);
    expect(largerView.articles).toHaveLength(8);
    expect(largerView.hasMore).toBe(false);
  });

  it("selects a category-balanced briefing capped at five stories", () => {
    const articles = NEWS_CATEGORIES.flatMap((category, index) => Array.from({ length: 3 }, (_, itemIndex) => ({
      id: `${category.id}-${itemIndex}`,
      title: `${category.label} story ${itemIndex}`,
      link: `https://example.com/${category.id}/${itemIndex}`,
      sourceId: category.id,
      source: category.label,
      sourceKind: "journalism",
      category: category.id,
      language: "en",
      publishedAt: new Date(Date.parse("2026-11-23T10:00:00.000Z") - index * 1000 - itemIndex * 100).toISOString(),
      coverage: [],
    })));

    const selected = selectBriefingArticles(articles, 5);
    expect(selected).toHaveLength(5);
    expect(new Set(selected.map((item) => item.category)).size).toBe(5);
  });

  it("does not select a duplicate headline twice for the briefing", () => {
    const sharedTitle = "Central bank announces emergency interest rate reduction";
    const selected = selectBriefingArticles([
      { id: "be", title: sharedTitle, category: "belgium", sourceKind: "journalism", sourceId: "one", publishedAt: "2026-11-23T10:00:00.000Z" },
      { id: "intl", title: sharedTitle, category: "international", sourceKind: "journalism", sourceId: "two", publishedAt: "2026-11-23T10:30:00.000Z" },
      { id: "intl-alt", title: "Central bank governor explains policy outlook", category: "international", sourceKind: "journalism", sourceId: "two", publishedAt: "2026-11-23T09:30:00.000Z" },
      { id: "tech", title: "New technology research published today", category: "technology-ai", sourceKind: "journalism", sourceId: "three", publishedAt: "2026-11-23T10:00:00.000Z" },
    ], 4, Date.parse("2026-11-23T12:00:00.000Z"));

    expect(selected.filter(({ title }) => title === sharedTitle)).toHaveLength(1);
    expect(selected.some(({ id }) => id === "intl-alt")).toBe(true);
    expect(articleRelevanceScore(selected[0], Date.parse("2026-11-23T12:00:00.000Z"))).toBeGreaterThan(0);
  });

  it("accepts the XML and JSON feed content types sources actually send", () => {
    for (const type of [
      "application/rss+xml; charset=UTF-8",
      "application/atom+xml;charset=utf-8",
      "application/feed+xml;charset=utf-8",
      "application/xml",
      "text/xml; charset=utf-8",
    ]) expect(isAllowedFeedContentType(type, false)).toBe(true);
    expect(isAllowedFeedContentType("application/json; charset=utf-8", true)).toBe(true);
    expect(isAllowedFeedContentType("text/html; charset=utf-8", false)).toBe(false);
    expect(isAllowedFeedContentType("text/html; x=application/xml", false)).toBe(false);
    expect(isAllowedFeedContentType("application/json", false)).toBe(false);
    expect(isAllowedFeedContentType("application/rss+xml", true)).toBe(false);
  });
});
