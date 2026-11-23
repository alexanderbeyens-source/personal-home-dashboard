import { XMLParser, XMLValidator } from "fast-xml-parser";

export const NEWS_CATEGORIES = [
  { id: "belgium", label: "Belgium" },
  { id: "international", label: "International" },
  { id: "technology-ai", label: "Technology & AI" },
  { id: "economy-business", label: "Economy & business" },
  { id: "data-software", label: "Data & software" },
  { id: "sport", label: "Sport" },
];

export const NEWS_SOURCES = [
  {
    id: "vrt-nws",
    enabled: false,
    name: "VRT NWS",
    category: "belgium",
    language: "nl",
    kind: "journalism",
    format: "xml",
    url: "https://www.vrt.be/vrtnws/nl.rss.headlines.xml",
  },
  {
    id: "rtbf-belgique",
    name: "RTBF Belgique",
    category: "belgium",
    language: "fr",
    kind: "journalism",
    format: "xml",
    url: "https://rss.rtbf.be/article/rss/highlight_rtbfinfo_info-belgique.xml?source=internal",
  },
  {
    id: "bbc-news",
    name: "BBC News",
    category: "international",
    language: "en",
    kind: "journalism",
    format: "xml",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
  },
  {
    id: "guardian-world",
    name: "The Guardian",
    category: "international",
    language: "en",
    kind: "journalism",
    format: "xml",
    url: "https://www.theguardian.com/world/rss",
  },
  {
    id: "ars-technica",
    name: "Ars Technica",
    category: "technology-ai",
    language: "en",
    kind: "journalism",
    format: "xml",
    url: "https://feeds.arstechnica.com/arstechnica/index",
  },
  {
    id: "bbc-technology",
    name: "BBC News",
    category: "technology-ai",
    language: "en",
    kind: "journalism",
    format: "xml",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
  },
  {
    id: "mit-technology-review",
    name: "MIT Technology Review",
    category: "technology-ai",
    language: "en",
    kind: "journalism",
    format: "xml",
    url: "https://www.technologyreview.com/feed/",
  },
  {
    id: "bbc-business",
    name: "BBC Business",
    category: "economy-business",
    language: "en",
    kind: "journalism",
    format: "xml",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
  },
  {
    id: "de-tijd",
    name: "De Tijd",
    category: "economy-business",
    language: "nl",
    kind: "journalism",
    format: "xml",
    url: "https://www.tijd.be/rss/nieuws.xml",
  },
  {
    id: "simon-willison",
    name: "Simon Willison",
    category: "data-software",
    language: "en",
    kind: "personal-blog",
    format: "xml",
    url: "https://simonwillison.net/atom/everything/",
  },
  {
    id: "github-changelog",
    name: "GitHub Changelog",
    category: "data-software",
    language: "en",
    kind: "official-company",
    format: "xml",
    url: "https://github.blog/changelog/feed/",
  },
  {
    id: "espn-nba-news",
    name: "ESPN",
    category: "sport",
    language: "en",
    kind: "journalism",
    format: "json",
    url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=10",
  },
  {
    id: "bbc-premier-league",
    name: "BBC Sport",
    category: "sport",
    language: "en",
    kind: "journalism",
    format: "xml",
    url: "https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml",
  },
];

const SOURCE_KIND_PRIORITY = {
  journalism: 0,
  "official-institution": 1,
  "official-company": 2,
  "personal-blog": 3,
  "community-aggregator": 4,
};
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_MS = 60 * 1000;
const MAX_SOURCE_ARTICLES = 25;
const MAX_ARTICLES_PER_RESPONSE = 20;
const MAX_SOURCE_CONTENT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_FUZZY_DUPLICATE_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_EXACT_TITLE_DUPLICATE_AGE_MS = 72 * 60 * 60 * 1000;
const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "ref_url",
]);
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
  "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "with",
  "de", "des", "du", "en", "et", "la", "le", "les", "un", "une", "van", "voor",
  "een", "het", "in", "op", "over", "met", "bij", "door",
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  processEntities: false,
  trimValues: true,
  cdataPropName: "#cdata",
});

export function parseFeedXml(xml, source, limit = MAX_SOURCE_ARTICLES) {
  if (typeof xml !== "string" || hasProhibitedXmlDeclarations(xml)) {
    throw new Error("Feed contains unsupported XML declarations.");
  }
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) throw new Error("Feed is not valid XML.");

  const parsed = xmlParser.parse(xml);
  const root = parsed.rss ?? parsed.feed ?? parsed.RDF ?? parsed.rdf;
  if (!root || typeof root !== "object") throw new Error("Feed has an unsupported XML structure.");
  const container = root.channel ?? root;
  const entries = toArray(container.item ?? container.entry ?? root.item ?? root.entry).slice(0, limit);

  return entries
    .map((entry) => {
      const title = normalizeText(readText(entry.title)).slice(0, 500);
      const link = resolveArticleUrl(decodeXmlEntities(readLink(entry.link)), source.url);
      const rawDate =
        readText(entry.pubDate) ||
        readText(entry.published) ||
        readText(entry.updated) ||
        readText(entry.date);
      const publishedAt = normalizeDate(rawDate);
      if (!title || !link) return null;
      return {
        id: canonicalizeUrl(link),
        title,
        link,
        sourceId: source.id,
        source: source.name,
        sourceKind: source.kind,
        category: source.category,
        language: source.language,
        publishedAt,
        coverage: [],
      };
    })
    .filter(Boolean);
}

export function normalizeEspnNews(payload, source) {
  return (payload.articles ?? [])
    .slice(0, MAX_SOURCE_ARTICLES)
    .map((article) => {
      const title = normalizeText(article.headline ?? article.title ?? "").slice(0, 500);
      const link = resolveArticleUrl(article.links?.web?.href, source.url);
      if (!title || !link) return null;
      return {
        id: canonicalizeUrl(link),
        title,
        link,
        sourceId: source.id,
        source: source.name,
        sourceKind: source.kind,
        category: source.category,
        language: source.language,
        publishedAt: normalizeDate(article.published),
        coverage: [],
      };
    })
    .filter(Boolean);
}

export function canonicalizeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(url.protocol)) return "";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

export function deduplicateArticles(articles) {
  const sorted = [...articles].sort(compareArticles);
  const groups = [];
  const byUrl = new Map();
  const byTitle = new Map();

  for (const article of sorted) {
    const canonicalUrl = canonicalizeUrl(article.link);
    const normalizedTitle = normalizeTitle(article.title);
    const timestamp = parseTimestamp(article.publishedAt);
    let group = canonicalUrl ? byUrl.get(canonicalUrl) : null;

    if (!group && normalizedTitle) {
      const exactCandidates = byTitle.get(normalizedTitle) ?? [];
      group = exactCandidates.find((candidate) =>
        datesMayRepresentSameStory(timestamp, parseTimestamp(candidate.publishedAt), MAX_EXACT_TITLE_DUPLICATE_AGE_MS),
      );
    }

    if (!group && normalizedTitle && timestamp !== null) {
      const tokens = titleTokens(normalizedTitle);
      if (tokens.size >= 5) {
        group = groups.find((candidate) =>
          candidate.language === article.language &&
          isNearTimestamp(timestamp, parseTimestamp(candidate.publishedAt), MAX_FUZZY_DUPLICATE_AGE_MS) &&
          titleSimilarity(tokens, titleTokens(normalizeTitle(candidate.title))) >= 0.9,
        );
      }
    }

    const variant = {
      sourceId: article.sourceId,
      source: article.source,
      sourceKind: article.sourceKind,
      category: article.category,
      language: article.language,
      title: article.title,
      link: article.link,
      publishedAt: article.publishedAt,
    };

    if (group) {
      if (!group.coverage.some((entry) => entry.sourceId === variant.sourceId && canonicalizeUrl(entry.link) === canonicalUrl)) {
        group.coverage.push(variant);
      }
      if (canonicalUrl) byUrl.set(canonicalUrl, group);
      if (normalizedTitle) {
        const exactCandidates = byTitle.get(normalizedTitle) ?? [];
        if (!exactCandidates.includes(group)) exactCandidates.push(group);
        byTitle.set(normalizedTitle, exactCandidates);
      }
      if (compareArticles(article, group) < 0) {
        group.title = article.title;
        group.link = article.link;
        group.sourceId = article.sourceId;
        group.source = article.source;
        group.sourceKind = article.sourceKind;
        group.category = article.category;
        group.language = article.language;
        group.publishedAt = article.publishedAt;
        group.id = canonicalUrl || article.id;
      }
      continue;
    }

    group = { ...article, id: canonicalUrl || article.id, coverage: [variant] };
    groups.push(group);
    if (canonicalUrl) byUrl.set(canonicalUrl, group);
    if (normalizedTitle) {
      const exactCandidates = byTitle.get(normalizedTitle) ?? [];
      exactCandidates.push(group);
      byTitle.set(normalizedTitle, exactCandidates);
    }
  }

  return groups.sort(compareArticles);
}

export function selectBriefingArticles(articles, limit = 5) {
  const buckets = new Map(NEWS_CATEGORIES.map(({ id }) => [id, []]));
  for (const article of [...articles].sort(compareArticles)) {
    const bucket = buckets.get(article.category);
    if (bucket) bucket.push(article);
  }

  const orderedCategories = NEWS_CATEGORIES
    .filter(({ id }) => buckets.get(id).length > 0)
    .sort((a, b) => compareArticles(buckets.get(a.id)[0], buckets.get(b.id)[0]));
  const counts = new Map(NEWS_CATEGORIES.map(({ id }) => [id, 0]));
  const selected = [];
  const maxPerCategory = Math.max(1, Math.ceil(limit / Math.max(1, orderedCategories.length)));

  while (selected.length < limit) {
    let added = false;
    for (const category of orderedCategories) {
      const count = counts.get(category.id);
      if (count >= maxPerCategory) continue;
      const article = buckets.get(category.id)[count];
      if (!article) continue;
      selected.push(article);
      counts.set(category.id, count + 1);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

export function createNewsService({
  fetchXml,
  fetchJson,
  now = () => Date.now(),
  sources = NEWS_SOURCES,
  categories = NEWS_CATEGORIES,
  ttlMs = DEFAULT_TTL_MS,
  retryMs = DEFAULT_RETRY_MS,
  onSourceError = () => {},
}) {
  const activeSources = sources.filter((source) => source.enabled !== false);
  const sourcesById = new Map(activeSources.map((source) => [source.id, source]));
  const cache = new Map();
  const inFlight = new Map();
  const retryAfter = new Map();
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  async function loadSource(sourceId) {
    const source = sourcesById.get(sourceId);
    if (!source) throw apiError("Unknown news source.", 400);

    const cached = cache.get(sourceId);
    const currentTime = now();
    if (cached && currentTime - cached.fetchedAt < ttlMs) return sourceResult(cached, false, null, currentTime);
    if ((retryAfter.get(sourceId) ?? 0) > currentTime) {
      return failedSourceResult(source, cached, "Feed temporarily unavailable; retry is delayed.", currentTime);
    }
    const existing = inFlight.get(sourceId);
    if (existing) return existing;

    let request;
    request = (async () => {
      try {
        const articles = source.format === "json"
          ? normalizeEspnNews(await fetchJson(source), source)
          : parseFeedXml(await fetchXml(source), source);
        const entry = {
          source,
          articles,
          fetchedAt: now(),
        };
        cache.set(sourceId, entry);
        retryAfter.delete(sourceId);
        return sourceResult(entry, false, null, now());
      } catch (error) {
        retryAfter.set(sourceId, now() + retryMs);
        onSourceError(source, error);
        return failedSourceResult(source, cached, "Feed unavailable; showing the last successful data when available.", now());
      } finally {
        if (inFlight.get(sourceId) === request) inFlight.delete(sourceId);
      }
    })();
    inFlight.set(sourceId, request);
    return request;
  }

  async function query({ view, category, sourceId, since = "7d", limit } = {}) {
    const isBriefing = view === "briefing";
    if (view && !isBriefing) throw apiError("Unknown news view.", 400);
    if (!isBriefing && !categoriesById.has(category)) throw apiError("Unknown news category.", 400);
    if (!["24h", "7d", "30d", "all"].includes(since)) throw apiError("Unknown recency filter.", 400);

    const selectedSources = activeSources.filter((source) =>
      isBriefing ? true : source.category === category,
    );
    if (sourceId && !selectedSources.some((source) => source.id === sourceId)) {
      throw apiError("Unknown news source for this category.", 400);
    }
    const maxLimit = MAX_ARTICLES_PER_RESPONSE;
    const articleLimit = limit === undefined ? (isBriefing ? 5 : 5) : Number(limit);
    if (!Number.isInteger(articleLimit) || articleLimit < 1 || articleLimit > maxLimit) {
      throw apiError(`Article limit must be between 1 and ${maxLimit}.`, 400);
    }

    const feedResults = await Promise.all(selectedSources.map((source) => loadSource(source.id)));
    const warnings = feedResults.flatMap((result) => result.warnings);
    const rawArticles = feedResults.flatMap((result) => result.articles);
    let articles = deduplicateArticles(rawArticles);

    if (since !== "all") {
      const duration = since === "24h" ? 24 * 60 * 60 * 1000 : since === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      const currentTime = now();
      const cutoff = currentTime - duration;
      articles = articles.filter((article) => {
        const timestamp = parseTimestamp(article.publishedAt);
        return timestamp !== null && timestamp >= cutoff && timestamp <= currentTime + 5 * 60 * 1000;
      });
    }

    if (sourceId) {
      articles = articles
        .filter((article) => article.coverage.some((variant) => variant.sourceId === sourceId))
        .map((article) => useSourceVariant(article, sourceId));
    }

    const allMatchingArticles = isBriefing
      ? selectBriefingArticles(articles, Math.max(articleLimit, 5))
      : articles;
    const visibleArticles = allMatchingArticles.slice(0, articleLimit);
    const responseSources = selectedSources.map(publicSource);
    const feedStatus = feedResults.map((result) => ({
      sourceId: result.source.id,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      contentStale: result.contentStale,
      itemCount: result.articles.length,
    }));

    return {
      articles: visibleArticles,
      availableCount: allMatchingArticles.length,
      hasMore: allMatchingArticles.length > visibleArticles.length,
      sources: responseSources,
      feedStatus,
      warnings,
      stale: feedResults.some((result) => result.stale),
      updatedAt: new Date(now()).toISOString(),
    };
  }

  return {
    query,
    loadSource,
    clearCache() {
      cache.clear();
      inFlight.clear();
      retryAfter.clear();
    },
  };
}

function sourceResult(entry, stale, warning, currentTime = Date.now()) {
  const latestPublishedAt = entry.articles.reduce((latest, article) => {
    const timestamp = parseTimestamp(article.publishedAt);
    return timestamp !== null && (latest === null || timestamp > latest) ? timestamp : latest;
  }, null);
  const contentStale = latestPublishedAt !== null && currentTime - latestPublishedAt > MAX_SOURCE_CONTENT_AGE_MS;
  const warnings = warning ? [warning] : [];
  if (contentStale) {
    warnings.push({
      sourceId: entry.source.id,
      source: entry.source.name,
      message: "The newest published item is more than 14 days old.",
      stale: false,
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      latestPublishedAt: new Date(latestPublishedAt).toISOString(),
    });
  }
  return {
    source: entry.source,
    articles: entry.articles,
    fetchedAt: new Date(entry.fetchedAt).toISOString(),
    stale,
    contentStale,
    warning: warnings[0] ?? null,
    warnings,
  };
}

function failedSourceResult(source, cached, message, currentTime) {
  const warning = {
    sourceId: source.id,
    source: source.name,
    message,
    stale: Boolean(cached),
    fetchedAt: cached ? new Date(cached.fetchedAt).toISOString() : null,
  };
  const cachedResult = cached ? sourceResult(cached, true, warning, currentTime) : null;
  return {
    source,
    articles: cached?.articles ?? [],
    fetchedAt: warning.fetchedAt,
    stale: warning.stale,
    contentStale: cachedResult?.contentStale ?? false,
    warning,
    warnings: cachedResult?.warnings ?? [warning],
  };
}

function publicSource(source) {
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    language: source.language,
    kind: source.kind,
  };
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function readText(value) {
  if (Array.isArray(value)) return value.map(readText).filter(Boolean).join(" ");
  if (typeof value === "string") return decodeXmlEntities(value);
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const parts = [];
  if (typeof value["#text"] === "string") parts.push(decodeXmlEntities(value["#text"]));
  if (typeof value["#cdata"] === "string") parts.push(value["#cdata"]);
  if (typeof value.name === "string") parts.push(decodeXmlEntities(value.name));
  return parts.join(" ");
}

function readLink(value) {
  const links = toArray(value);
  for (const link of links) {
    if (typeof link === "string") return link;
    if (!link || typeof link !== "object") continue;
    const relation = link["@_rel"];
    if (!relation || relation === "alternate") {
      const href = link["@_href"] ?? readText(link);
      if (href) return href;
    }
  }
  const first = links[0];
  return first && typeof first === "object" ? first["@_href"] ?? readText(first) : "";
}

function toArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveArticleUrl(value, feedUrl) {
  const rawUrl = normalizeText(value);
  if (!rawUrl || rawUrl.length > 2048) return null;
  try {
    const url = new URL(rawUrl, feedUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeTitle(value) {
  return normalizeText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function titleTokens(normalizedTitle) {
  return new Set(normalizedTitle.split(/\s+/).filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

function titleSimilarity(first, second) {
  if (!first.size || !second.size) return 0;
  let intersection = 0;
  for (const token of first) if (second.has(token)) intersection += 1;
  return intersection / (first.size + second.size - intersection);
}

function parseTimestamp(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isNearTimestamp(first, second, windowMs) {
  return second !== null && Math.abs(first - second) <= windowMs;
}

function datesMayRepresentSameStory(first, second, windowMs) {
  return first === null || second === null || Math.abs(first - second) <= windowMs;
}

function compareArticles(first, second) {
  const firstDate = parseTimestamp(first.publishedAt);
  const secondDate = parseTimestamp(second.publishedAt);
  if (firstDate !== secondDate) {
    if (firstDate === null) return 1;
    if (secondDate === null) return -1;
    return secondDate - firstDate;
  }
  const firstPriority = SOURCE_KIND_PRIORITY[first.sourceKind] ?? 10;
  const secondPriority = SOURCE_KIND_PRIORITY[second.sourceKind] ?? 10;
  if (firstPriority !== secondPriority) return firstPriority - secondPriority;
  return first.sourceId.localeCompare(second.sourceId) || first.title.localeCompare(second.title);
}

function useSourceVariant(article, sourceId) {
  const variant = article.coverage.find((item) => item.sourceId === sourceId);
  return variant ? { ...article, ...variant, id: article.id, coverage: article.coverage } : article;
}

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hasProhibitedXmlDeclarations(xml) {
  const withoutCommentsAndProcessingInstructions = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
  const rootStart = withoutCommentsAndProcessingInstructions.search(/<[A-Za-z_:][^>]*>/);
  const prolog = rootStart < 0
    ? withoutCommentsAndProcessingInstructions
    : withoutCommentsAndProcessingInstructions.slice(0, rootStart);
  return /<!DOCTYPE|<!ENTITY/i.test(prolog);
}

function decodeXmlEntities(value) {
  const namedEntities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return value.replace(/&(#x[0-9a-f]+|#X[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/g, (entity, value) => {
    if (value.startsWith("#")) {
      const hexadecimal = value[1].toLowerCase() === "x";
      const codePoint = Number.parseInt(value.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) return "\uFFFD";
      return String.fromCodePoint(codePoint);
    }
    return namedEntities[value] ?? entity;
  });
}
