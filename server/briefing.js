import { NEWS_CATEGORIES, articleRelevanceScore, deduplicateArticles, selectBriefingArticles } from "./news.js";

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

export function createDailyBriefingService({
  loadInputs,
  now = () => Date.now(),
  ttlMs = DEFAULT_CACHE_TTL_MS,
}) {
  let cached = null;
  let cachedInputs = null;
  let inFlight = null;

  async function get({ refresh = false } = {}) {
    const currentTime = now();
    if (!refresh && cached && currentTime - cached.generatedAt < ttlMs) return cached.value;
    if (inFlight) return inFlight;

    let request;
    request = (async () => {
      try {
        const inputs = retainStaleInputs(await loadInputs({ refresh }), cachedInputs);
        cachedInputs = inputs;
        const generatedAt = now();
        const value = composeDailyBriefing(inputs, generatedAt);
        cached = { generatedAt, value };
        return value;
      } catch (error) {
        if (cached) {
          return {
            ...cached.value,
            stale: true,
            warnings: [
              ...cached.value.warnings,
              {
                source: "Dagelijkse briefing",
                message: "Vernieuwen mislukt; de laatst gegenereerde briefing wordt getoond.",
                stale: true,
              },
            ],
          };
        }
        throw error;
      } finally {
        if (inFlight === request) inFlight = null;
      }
    })();
    inFlight = request;
    return request;
  }

  return { get };
}

function retainStaleInputs(inputs, previous) {
  if (!previous) return inputs;
  const retained = {
    ...inputs,
    newsByCategory: { ...(inputs.newsByCategory ?? {}) },
    warnings: [...(inputs.warnings ?? [])],
  };
  const staleSources = [
    ["economics", "Economische indicatoren"],
    ["weather", "Weer · Open-Meteo"],
    ["finance", "Referentiekoersen · Frankfurter"],
    ["nba", "NBA · ESPN"],
    ["nbaPlayers", "NBA-selecties · ESPN"],
    ["premierLeague", "Premier League · ESPN en BBC Sport"],
    ["belgianFootball", "Belgisch voetbal · Sporza"],
    ["agenda", "Agenda · ICS"],
  ];

  for (const [key, source] of staleSources) {
    if (key === "agenda" && retained.agendaConfigured === false) continue;
    if (retained[key] === undefined && previous[key] !== undefined) {
      retained[key] = previous[key];
      addStaleWarning(retained.warnings, source);
    }
  }
  for (const category of NEWS_CATEGORIES.map(({ id }) => id)) {
    if (retained.newsByCategory[category] === undefined && previous.newsByCategory?.[category]) {
      retained.newsByCategory[category] = previous.newsByCategory[category];
      addStaleWarning(retained.warnings, `Nieuws · ${category}`);
    }
  }
  return retained;
}

function addStaleWarning(warnings, source) {
  const warning = warnings.find((item) => item.source === source);
  if (warning) warning.stale = true;
  else warnings.push({ source, message: "Vernieuwen mislukt; de laatste geslaagde gegevens worden getoond.", stale: true });
}

export function composeDailyBriefing(inputs, currentTime = Date.now()) {
  const newsByCategory = inputs.newsByCategory ?? {};
  const warnings = [...(inputs.warnings ?? [])];
  const feedArticles = NEWS_CATEGORIES.flatMap(({ id }) =>
    newsByCategory[id]?.articles ?? [],
  );
  for (const response of Object.values(newsByCategory)) {
    for (const warning of response?.warnings ?? []) {
      warnings.push({
        source: warning.source,
        message: warning.message,
        stale: warning.stale,
      });
    }
  }
  warnings.push(...(inputs.economics?.warnings ?? []));
  for (const [source, response] of [
    ["NBA · ESPN", inputs.nba],
    ["NBA-selecties · ESPN", inputs.nbaPlayers],
    ["Premier League · ESPN en BBC Sport", inputs.premierLeague],
    ["Belgisch voetbal · Sporza", inputs.belgianFootball],
  ]) {
    for (const message of response?.warnings ?? []) {
      warnings.push({ source, message, stale: false });
    }
  }

  const articles = deduplicateArticles(feedArticles).filter((article) =>
    article.category !== "belgium" || ["nl", "en"].includes(article.language?.toLowerCase().split("-")[0]),
  );
  const selectedTopStories = selectBriefingArticles(articles, 5, currentTime);
  const topStoryIds = new Set(selectedTopStories.map(({ id, link }) => id || link));
  const toStory = (article, whySelected) => createBriefingStory(article, whySelected);
  const additionalStories = (categoryId, limit) => articles
    .filter((article) =>
      article.category === categoryId && !topStoryIds.has(article.id || article.link),
    )
    .sort((a, b) => articleRelevanceScore(b, currentTime) - articleRelevanceScore(a, currentTime))
    .slice(0, limit)
    .map((article) => toStory(article));

  const groupedNews = [...additionalStories("belgium", 1), ...additionalStories("international", 1)]
    .sort((a, b) => comparePublishedDates(b.publishedAt, a.publishedAt));
  const finance = inputs.finance ?? null;
  const agenda = inputs.agenda ?? null;
  const weather = inputs.weather ?? null;
  const nba = inputs.nba ?? null;
  const premierLeague = inputs.premierLeague ?? null;
  const belgianFootball = inputs.belgianFootball ?? null;

  return {
    generatedAt: new Date(currentTime).toISOString(),
    stale: false,
    topStories: selectedTopStories.map((article) => toStory(
      article,
      "Gerangschikt op actualiteit, brontype en plaats in de feed, met categoriebalans en onderwerpvariatie.",
    )),
    sections: {
      belgiumInternational: groupedNews,
      technology: additionalStories("technology-ai", 1),
    },
    economy: {
      stories: additionalStories("economy-business", 1),
      referenceRates: finance,
      referenceLabel: "Dagelijkse ECB-referentiekoersen via Frankfurter",
      indicatorDevelopments: selectEconomicDevelopments(inputs.economics, currentTime),
    },
    sports: {
      nba: {
        matches: selectRelevantMatches(nba?.events ?? [], currentTime, ["LAL", "POR", "OKC"], 2)
          .map((event) => createBriefingMatch(event, "https://www.espn.com/nba/scoreboard")),
        featuredPlayers: inputs.nbaPlayers?.featuredPlayers ?? [],
        headlines: selectNbaHeadlines((nba?.news ?? []).filter((article) =>
          !topStoryIds.has(article.id || article.link),
        )).map((article) => toStory(article)),
      },
      premierLeague: {
        matches: selectRelevantMatches(premierLeague?.events ?? [], currentTime, [], 2)
          .map((event) => createBriefingMatch(event, "https://www.espn.com/soccer/scoreboard?league=eng.1")),
        headlines: (premierLeague?.news ?? [])
          .filter((article) => !topStoryIds.has(article.id || article.link))
          .slice(0, 1)
          .map((article) => toStory(article)),
      },
      belgianFootball: (belgianFootball?.news ?? [])
        .filter((article) => !topStoryIds.has(article.id || article.link))
        .slice(0, 2)
        .map((article) => toStory(
          article,
          article.sportGroup === "red-devils" ? "Rode Duivels" : "Jupiler Pro League",
        )),
    },
    today: {
      agendaStatus: !inputs.agendaConfigured
        ? "not-configured"
        : agenda
          ? "available"
          : "unavailable",
      agendaEvents: (agenda?.events ?? [])
        .filter((event) => Date.parse(event.start) >= currentTime)
        .slice(0, 3),
      weather,
    },
    warnings: deduplicateWarnings(warnings),
  };
}

function selectEconomicDevelopments(economics, currentTime) {
  if (!economics) return [];
  const developments = [];
  const recentPolicyChanges = (economics.policyRates?.rates ?? [])
    .filter((rate) => {
      const age = currentTime - Date.parse(rate.lastChangeDate);
      return !rate.stale && !rate.observationStale && Number.isFinite(age) && age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
    })
    .sort((first, second) => Date.parse(second.lastChangeDate) - Date.parse(first.lastChangeDate));
  if (recentPolicyChanges.length) {
    const newest = recentPolicyChanges[0];
    developments.push({
      id: "ecb-policy-rate-change",
      title: "Recente wijziging van de ECB-beleidsrente",
      summary: `${newest.label} gewijzigd op ${newest.lastChangeDate}. Huidige officiële rentes: ${formatEconomicRates(economics.policyRates.rates)}.`,
      source: "Europese Centrale Bank",
      sourceUrl: economics.policyRates.sourceUrl,
      period: newest.lastChangeDate,
    });
  }

  const inflation = [
    ["Belgische HICP", economics.belgiumInflation],
    ["HICP eurozone", economics.euroAreaInflation],
  ].filter(([, metric]) =>
    metric && !metric.stale && !metric.observationStale &&
    Number.isFinite(metric.change) && Math.abs(metric.change) >= 0.5,
  ).sort((first, second) => Math.abs(second[1].change) - Math.abs(first[1].change));
  if (inflation.length) {
    const [label, metric] = inflation[0];
    developments.push({
      id: `inflation-${label.toLowerCase().replaceAll(" ", "-")}`,
      title: `${label} opvallend gewijzigd`,
      summary: `${metric.value.toFixed(1)}% op jaarbasis in ${metric.period}, ${formatChange(metric.change)} procentpunt t.o.v. de vorige maand.`,
      source: metric.source,
      sourceUrl: metric.sourceUrl,
      period: metric.period,
    });
  }

  const mortgage = economics.mortgageRates;
  if (
    developments.length < 2 &&
    mortgage &&
    !mortgage.stale &&
    !mortgage.observationStale &&
    Number.isFinite(mortgage.change) &&
    Math.abs(mortgage.change) >= 0.25
  ) {
    developments.push({
      id: "belgian-mortgage-rate-change",
      title: "Rente op nieuwe Belgische hypotheken opvallend gewijzigd",
      summary: `${mortgage.value.toFixed(2)}% in ${mortgage.period}, ${formatChange(mortgage.change)} procentpunt t.o.v. de vorige maand.`,
      source: mortgage.source,
      sourceUrl: mortgage.sourceUrl,
      period: mortgage.period,
    });
  }

  if (developments.length < 2) {
    const energy = [
      ["Elektriciteit", economics.electricityPrices],
      ["Aardgas", economics.gasPrices],
    ].filter(([, metric]) =>
      metric && !metric.stale && metric.previousValue > 0 &&
      !metric.observationStale &&
      Math.abs(metric.value - metric.previousValue) / metric.previousValue >= 0.1,
    ).sort((first, second) =>
      Math.abs(second[1].value - second[1].previousValue) / second[1].previousValue -
      Math.abs(first[1].value - first[1].previousValue) / first[1].previousValue,
    );
    if (energy.length) {
      const [label, metric] = energy[0];
      const percentChange = ((metric.value - metric.previousValue) / metric.previousValue) * 100;
      developments.push({
        id: `energy-${label.toLowerCase().replaceAll(" ", "-")}`,
        title: `${label === "Elektriciteit" ? "Elektriciteitsprijs" : "Aardgasprijs"} voor Belgische gezinnen opvallend gewijzigd`,
        summary: `${metric.value.toFixed(4)} EUR/kWh in ${metric.period}, ${formatChange(percentChange, 1)}% t.o.v. het vorige halfjaar.`,
        source: metric.source,
        sourceUrl: metric.sourceUrl,
        period: metric.period,
      });
    }
  }

  const worldGrowth = economics.worldGrowth;
  if (
    developments.length < 2 &&
    worldGrowth &&
    !worldGrowth.stale &&
    !worldGrowth.observationStale &&
    Number.isFinite(worldGrowth.change) &&
    Math.abs(worldGrowth.change) >= 1
  ) {
    developments.push({
      id: "global-real-gdp-growth",
      title: "Mondiale reële bbp-groei opvallend gewijzigd",
      summary: `${worldGrowth.value.toFixed(1)}% in ${worldGrowth.period}, ${formatChange(worldGrowth.change)} procentpunt t.o.v. het vorige jaar.`,
      source: worldGrowth.source,
      sourceUrl: worldGrowth.sourceUrl,
      period: worldGrowth.period,
    });
  }

  return developments.slice(0, 2);
}

function formatEconomicRates(rates) {
  return [
    ["deposit", "depositorente"],
    ["refinancing", "herfinancieringsrente"],
    ["lending", "marginale beleningsrente"],
  ]
    .map(([id, label]) => {
      const rate = rates.find((item) => item.id === id);
      return rate ? `${label} ${rate.value.toFixed(2)}%` : `${label} niet beschikbaar`;
    })
    .join(", ");
}

function formatChange(value, precision = 1) {
  const amount = Math.abs(value).toFixed(precision);
  return value > 0 ? `+${amount}` : value < 0 ? `-${amount}` : amount;
}

function createBriefingStory(article, whySelected = null) {
  const description = typeof article.description === "string" ? article.description.trim() : "";
  const coverage = (article.coverage ?? [])
    .filter((item) => item.sourceId !== article.sourceId || item.link !== article.link)
    .map(({ source, link }) => ({ source, link }));
  return {
    id: article.id || article.link,
    title: article.title,
    summary: description ? compactDescription(description) : null,
    whySelected,
    source: article.source,
    sourceKind: article.sourceKind,
    category: article.category,
    language: article.language,
    publishedAt: article.publishedAt,
    link: article.link,
    coverage,
    sportGroup: article.sportGroup ?? null,
  };
}

function compactDescription(description) {
  if (description.length <= 220) return description;
  const sentenceEnd = description.slice(0, 220).lastIndexOf(". ");
  const end = sentenceEnd >= 110 ? sentenceEnd + 1 : 217;
  return `${description.slice(0, end).trimEnd()}…`;
}

function selectRelevantMatches(events, currentTime, preferredTeams, limit) {
  const from = currentTime - 24 * 60 * 60 * 1000;
  const to = currentTime + 24 * 60 * 60 * 1000;
  return [...events]
    .filter((event) => {
      const timestamp = Date.parse(event.date);
      return Number.isFinite(timestamp) && timestamp >= from && timestamp <= to;
    })
    .sort((first, second) => {
      const firstPriority = matchStatePriority(first.state);
      const secondPriority = matchStatePriority(second.state);
      if (firstPriority !== secondPriority) return firstPriority - secondPriority;
      const firstPreferred = first.competitors.some(({ abbreviation }) => preferredTeams.includes(abbreviation));
      const secondPreferred = second.competitors.some(({ abbreviation }) => preferredTeams.includes(abbreviation));
      if (firstPreferred !== secondPreferred) return Number(secondPreferred) - Number(firstPreferred);
      return Date.parse(first.date) - Date.parse(second.date);
    })
    .slice(0, limit);
}

function selectNbaHeadlines(articles) {
  const prioritized = [...articles].sort((first, second) => {
    const priority = (article) => /lakers|camara|aj mitchell|trail blazers|thunder/i.test(article.title) ? 0 : 1;
    return priority(first) - priority(second);
  });
  return prioritized.slice(0, 2);
}

function matchStatePriority(state) {
  return state === "in" ? 0 : state === "post" ? 1 : state === "pre" ? 2 : 3;
}

function createBriefingMatch(event, link) {
  return {
    ...event,
    link,
    label: event.state === "in" ? "Live" : event.state === "post" ? "Uitslag" : "Gepland",
    source: "ESPN",
  };
}

function comparePublishedDates(first, second) {
  return (Date.parse(second) || 0) - (Date.parse(first) || 0);
}

function deduplicateWarnings(warnings) {
  const unique = new Map();
  for (const warning of warnings) {
    const source = warning.source || "Live gegevens";
    const message = warning.message || "Gegevens zijn tijdelijk niet beschikbaar.";
    const key = `${source}:${message}`;
    const stale = Boolean(warning.stale || unique.get(key)?.stale);
    unique.set(key, {
      source,
      message,
      stale,
    });
  }
  return [...unique.values()];
}
