import { useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { Panel, ResourceState } from "./components/Panel";
import { useLiveResource } from "./hooks/useLiveResource";
import { MobilityHomePage } from "./MobilityHomePage";
import type {
  CalendarData,
  DailyBriefing,
  EconomicData,
  EconomicMetric,
  FinanceData,
  HomeData,
  LiveResource,
  NewsResponse,
  Project,
  SportsData,
  WeatherData,
} from "./types";

const newsCategories = [
  { id: "belgium", label: "Belgium" },
  { id: "international", label: "International" },
  { id: "technology-ai", label: "Technology & AI" },
  { id: "economy-business", label: "Economy & business" },
  { id: "sport", label: "Sport" },
] as const;

interface AuthUser {
  id: string;
  name?: string | null;
}

type AccessState =
  | { status: "loading" }
  | { status: "unauthenticated"; csrfToken: string }
  | { status: "authenticated"; csrfToken: string; user: AuthUser }
  | { status: "error"; message: string };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function weatherLabel(code: number, isDay: boolean) {
  if (code === 0) return isDay ? "Clear skies" : "Clear night";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rain showers";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(date));
}

function formatPublishedDate(date: string | null) {
  if (!date) return "Date unavailable";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatEventTimestamp(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

function formatEconomicPeriod(period: string) {
  const semester = period.match(/^(\d{4})-S([12])$/);
  if (semester) return `H${semester[2]} ${semester[1]}`;
  const month = period.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" })
      .format(new Date(Number(month[1]), Number(month[2]) - 1, 1));
  }
  const dateOnly = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(period);
  if (Number.isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function EconomicSparkline({ history, label }: {
  history: { period: string; value: number }[];
  label: string;
}) {
  if (history.length < 2) return null;
  const values = history.map(({ value }) => value);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 31 - ((value - min) / range) * 25;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="economic-sparkline" viewBox="0 0 100 36" role="img" aria-label={`${label} historical trend`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EconomicMetricCard({ title, metric }: { title: string; metric: EconomicMetric | null }) {
  return (
    <article className="economic-metric-card">
      <div className="economic-metric-heading">
        <h4>{title}</h4>
        {(metric?.stale || metric?.observationStale) && (
          <span className="economic-stale" title={metric.stale
            ? "Refresh failed; showing the previous successful observation."
            : "The observation is older than its expected update cycle."}>STALE</span>
        )}
      </div>
      {metric ? (
        <>
          <strong className="economic-metric-value">{metric.value.toFixed(metric.unit === "EUR/kWh" ? 4 : 2)} <small>{metric.unit}</small></strong>
          <p className="economic-metric-period">{formatEconomicPeriod(metric.period)} · {metric.frequency.split(" · ")[0]}</p>
          {metric.sourceUpdatedAt && (
            <p className="economic-metric-note">Dataset updated {formatPublishedDate(metric.sourceUpdatedAt)}</p>
          )}
          <EconomicSparkline history={metric.history} label={title} />
          {metric.change !== null && (
            <p className="economic-metric-change">
              {metric.unit === "% y/y"
                ? `${metric.change > 0 ? "+" : ""}${metric.change.toFixed(1)} pp vs previous period`
                : metric.unit === "%"
                  ? `${metric.change > 0 ? "+" : ""}${metric.change.toFixed(2)} pp vs previous period`
                  : `${metric.change > 0 ? "+" : ""}${metric.change.toFixed(4)} ${metric.unit} vs previous period`}
            </p>
          )}
          {metric.disclaimer && <p className="economic-metric-note">{metric.disclaimer}</p>}
          {metric.consumptionBand && <p className="economic-metric-note">{metric.consumptionBand} · all taxes included</p>}
          <a className="economic-source-link" href={metric.sourceUrl} target="_blank" rel="noopener noreferrer">{metric.source}</a>
        </>
      ) : (
        <p className="economic-unavailable">Currently unavailable</p>
      )}
    </article>
  );
}

function EconomicCockpit() {
  const finance = useLiveResource<FinanceData>("/api/finance", 60 * 60 * 1000, "/api/finance?refresh=1");
  const economics = useLiveResource<EconomicData>("/api/economy", 60 * 60 * 1000, "/api/economy?refresh=1");
  const resources = [finance, economics];
  const hasData = resources.some((resource) => resource.data !== null);
  const resource: LiveResource<unknown> = {
    data: hasData ? { finance: finance.data, economics: economics.data } : null,
    loading: !hasData && resources.some((item) => item.loading),
    refreshing: hasData && resources.some((item) => item.loading || item.refreshing),
    error: resources.map((item) => item.error).filter(Boolean).join(" · ") || null,
    updatedAt: resources.map((item) => item.updatedAt)
      .filter((date): date is Date => date !== null)
      .sort((first, second) => first.getTime() - second.getTime())[0] ?? null,
    refresh: async () => {
      await Promise.all(resources.map((item) => item.refresh()));
    },
  };
  const data = economics.data;
  const imie = data?.imiePrice;

  return (
    <Panel title="Economy & markets" eyebrow="ECONOMIC COCKPIT" icon="chart" className="finance-panel" resource={resource}>
      {data?.warnings.length ? (
        <div className="economic-warnings" role="status">
          {data.warnings.map((warning) => (
            <p key={`${warning.source}-${warning.message}`}>
              <strong>{warning.source}:</strong> {warning.message}
              {warning.stale ? " Showing the last successful observation." : ""}
            </p>
          ))}
        </div>
      ) : null}
      <section className="economic-equities">
        <div>
          <p className="economic-kicker">GLOBAL EQUITIES · IMIE</p>
          <h3>SPDR MSCI ACWI IMI</h3>
          <p>Broad developed- and emerging-market equity exposure</p>
        </div>
        {imie ? (
          <div className="economic-equity-price">
            {(imie.stale || imie.observationStale) && (
              <span className="economic-stale" title={imie.stale
                ? "Refresh failed; showing the previous successful observation."
                : "The observation is older than its expected update cycle."}>STALE</span>
            )}
            <strong>€{imie.value.toFixed(2)}</strong>
            <span>{formatEconomicPeriod(imie.period)} · official closing price</span>
            <a href={imie.sourceUrl} target="_blank" rel="noopener noreferrer">{imie.source}</a>
          </div>
        ) : <p className="economic-unavailable">Official market price unavailable.</p>}
      </section>

      <section className="economic-subsection">
        <div className="economic-section-heading">
          <h3>ECB policy rates</h3>
          <a href={data?.policyRates?.sourceUrl ?? "https://data.ecb.europa.eu/data/datasets/FM"} target="_blank" rel="noopener noreferrer">ECB source</a>
        </div>
        {data?.policyRates?.rates.length ? (
          <div className="economic-rate-grid">
            {data.policyRates.rates.map((rate) => (
              <article className="economic-rate-card" key={rate.id}>
                <div className="economic-metric-heading">
                  <h4>{rate.label}</h4>
                  {(rate.stale || rate.observationStale) && (
                    <span className="economic-stale" title={rate.stale
                      ? "Refresh failed; showing the previous successful observation."
                      : "The observation is older than its expected update cycle."}>STALE</span>
                  )}
                </div>
                <strong>{rate.value.toFixed(2)}<small>%</small></strong>
                <span>Data as of {formatEconomicPeriod(rate.period)}</span>
                <span>{rate.lastChangeDate
                  ? `Last changed ${formatEconomicPeriod(rate.lastChangeDate)}`
                  : "No change observed in the 7-year history window"}</span>
                <EconomicSparkline history={rate.history} label={rate.label} />
              </article>
            ))}
          </div>
        ) : <p className="economic-unavailable">Policy rates are currently unavailable.</p>}
      </section>

      <section className="economic-subsection">
        <h3>World, inflation & housing</h3>
        <div className="economic-metric-grid">
          <EconomicMetricCard title="Global real GDP growth" metric={data?.worldGrowth ?? null} />
          <EconomicMetricCard title="Belgium · HICP" metric={data?.belgiumInflation ?? null} />
          <EconomicMetricCard title="Euro area · HICP" metric={data?.euroAreaInflation ?? null} />
          <EconomicMetricCard title="Belgian new mortgages" metric={data?.mortgageRates ?? null} />
        </div>
      </section>

      <section className="economic-subsection">
        <h3>Belgian household energy</h3>
        <div className="economic-metric-grid">
          <EconomicMetricCard title="Electricity" metric={data?.electricityPrices ?? null} />
          <EconomicMetricCard title="Natural gas" metric={data?.gasPrices ?? null} />
        </div>
        <p className="economic-section-note">Eurostat consumer prices for representative household consumption bands; includes taxes and levies. Not wholesale prices.</p>
      </section>

      <section className="economic-subsection economic-fx">
        <div className="economic-section-heading">
          <h3>Daily FX reference</h3>
          <a href="https://www.frankfurter.app/" target="_blank" rel="noopener noreferrer">Frankfurter · ECB data</a>
        </div>
        {finance.data ? (
          <>
            <p className="economic-metric-period">1 EUR · {formatEconomicPeriod(finance.data.date)} · reference rates, not personal account balances</p>
            <div className="rates-grid">
              {Object.entries(finance.data.rates).map(([currency, value]) => (
                <div className="rate-tile" key={currency}><span>1 EUR <Icon name="arrow" size={11} /></span><strong>{value.toFixed(3)} <small>{currency}</small></strong></div>
              ))}
            </div>
          </>
        ) : <p className="economic-unavailable">Reference rates are currently unavailable.</p>}
      </section>

      <p className="panel-footnote">ECB rates and lending data · Eurostat HICP and household energy prices · IMIE issuer market close. Monthly and half-yearly figures are labeled by their observation period.</p>
    </Panel>
  );
}

function BriefingStoryCard({ story, featured = false }: {
  story: DailyBriefing["topStories"][number];
  featured?: boolean;
}) {
  return (
    <article className={`briefing-story${featured ? " is-featured" : ""}`}>
      <a className="briefing-story-title" href={story.link} target="_blank" rel="noopener noreferrer">
        {story.title}<Icon name="arrow" size={13} />
      </a>
      <p className="briefing-story-summary">
        {story.summary ?? "The source did not provide a summary; open the original report for details."}
      </p>
      {featured && story.whySelected && (
        <p className="briefing-story-why"><strong>Why selected:</strong> {story.whySelected}</p>
      )}
      <div className="briefing-story-meta">
        <a href={story.link} target="_blank" rel="noopener noreferrer">{story.source}</a>
        <span>{getNewsCategoryLabel(story.category)}</span>
        <time dateTime={story.publishedAt ?? undefined}>{formatPublishedDate(story.publishedAt)}</time>
      </div>
      {story.coverage.length > 0 && (
        <div className="briefing-coverage">
          Also covered by {story.coverage.map((item, index) => (
            <span key={`${item.source}-${item.link}`}>
              {index > 0 && ", "}
              <a href={item.link} target="_blank" rel="noopener noreferrer">{item.source}</a>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function BriefingStoryList({
  stories,
  empty,
}: {
  stories: DailyBriefing["sections"]["technology"];
  empty: string;
}) {
  return stories.length
    ? <div className="briefing-story-list">{stories.map((story) => <BriefingStoryCard key={story.id} story={story} />)}</div>
    : <p className="briefing-empty">{empty}</p>;
}

function BriefingMatches({ matches }: { matches: DailyBriefing["sports"]["nba"]["matches"] }) {
  if (!matches.length) return <p className="briefing-empty">No matches in the past 24 hours or next 24 hours.</p>;
  return (
    <div className="briefing-match-list">
      {matches.map((match) => (
        <a className="briefing-match" href={match.link} target="_blank" rel="noopener noreferrer" key={match.id}>
          <span className="briefing-match-label">{match.label}</span>
          <strong>{match.name}</strong>
          <span>{match.competitors.map((team) => `${team.name} ${team.score || "—"}`).join(" · ")}</span>
          <time dateTime={match.date}>{formatEventTimestamp(match.date)}</time>
          <small>{match.source} scoreboard</small>
        </a>
      ))}
    </div>
  );
}

function DailyBriefingPanel() {
  const resource = useLiveResource<DailyBriefing>(
    "/api/briefing",
    15 * 60 * 1000,
    "/api/briefing?refresh=1",
  );
  const briefing = resource.data;
  const calendarWarning = briefing?.warnings.some((warning) => warning.source === "Calendar · ICS");

  return (
    <Panel
      title="Daily briefing"
      eyebrow={briefing ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(briefing.generatedAt)).toUpperCase() : "YOUR DAY · BRIEFING"}
      icon="news"
      className="daily-briefing-panel"
      resource={resource}
    >
      {briefing ? (
        <>
          <p className="briefing-generated">
            Generated {formatPublishedDate(briefing.generatedAt)} · cached for 15 minutes
            {briefing.stale && <strong> · showing the last successful version</strong>}
          </p>
          {briefing.warnings.length > 0 && (
            <div className="briefing-warnings" role="status">
              {briefing.warnings.slice(0, 4).map((warning) => (
                <p key={`${warning.source}-${warning.message}`}>
                  <strong>{warning.source}:</strong> {warning.message}
                  {warning.stale ? " Showing cached data where available." : ""}
                </p>
              ))}
              {briefing.warnings.length > 4 && <p>{briefing.warnings.length - 4} more source notices.</p>}
            </div>
          )}

          <section className="briefing-section briefing-top-stories">
            <h3>Top stories <span>· {briefing.topStories.length} selected, maximum 5</span></h3>
            {briefing.topStories.length ? (
              <div className="briefing-story-list">
                {briefing.topStories.map((story) => <BriefingStoryCard key={story.id} story={story} featured />)}
              </div>
            ) : (
              <p className="briefing-empty">No recent stories are available from the active feeds.</p>
            )}
          </section>

          <div className="briefing-topic-grid">
            <section className="briefing-section">
              <h3>Belgium & international</h3>
              <BriefingStoryList stories={briefing.sections.belgiumInternational} empty="No additional Belgium or international reports beyond the top stories." />
            </section>
            <section className="briefing-section">
              <h3>Technology & AI</h3>
              <BriefingStoryList stories={briefing.sections.technology} empty="No additional technology reports beyond the top stories." />
            </section>
            <section className="briefing-section briefing-economy">
              <h3>Economy & business</h3>
              <BriefingStoryList stories={briefing.economy.stories} empty="No additional business reports beyond the top stories." />
              {briefing.economy.indicatorDevelopments.length > 0 && (
                <div className="briefing-economic-updates">
                  <strong>Official indicator developments</strong>
                  {briefing.economy.indicatorDevelopments.map((development) => (
                    <article key={development.id}>
                      <h4>{development.title}</h4>
                      <p>{development.summary}</p>
                      <a href={development.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {development.source} · {formatEconomicPeriod(development.period)}
                      </a>
                    </article>
                  ))}
                </div>
              )}
              <div className="briefing-reference-rates">
                <strong>Reference figures · {briefing.economy.referenceLabel}</strong>
                {briefing.economy.referenceRates ? (
                  <>
                    <span>Rates for {briefing.economy.referenceRates.date} · 1 EUR</span>
                    <div className="briefing-rate-list">
                      {Object.entries(briefing.economy.referenceRates.rates).map(([currency, value]) => (
                        <span key={currency}>{currency} {value.toFixed(3)}</span>
                      ))}
                    </div>
                    <a href="https://www.frankfurter.app/" target="_blank" rel="noopener noreferrer">Frankfurter · ECB reference data</a>
                  </>
                ) : <p className="briefing-empty">Reference rates are currently unavailable.</p>}
              </div>
            </section>
          </div>

          <section className="briefing-section briefing-sports">
            <h3>Sports briefing</h3>
            <div className="briefing-sports-grid">
              <div>
                <h4>NBA</h4>
                <BriefingMatches matches={briefing.sports.nba.matches} />
                {briefing.sports.nba.featuredPlayers.length > 0 && (
                  <div className="briefing-player-links">
                    {briefing.sports.nba.featuredPlayers.map((player) => (
                      <a href={player.url} target="_blank" rel="noopener noreferrer" key={player.name}>
                        {player.name} · {player.team} <span>ESPN roster</span>
                      </a>
                    ))}
                  </div>
                )}
                <BriefingStoryList stories={briefing.sports.nba.headlines} empty="No NBA headlines are available." />
              </div>
              <div>
                <h4>Premier League</h4>
                <BriefingMatches matches={briefing.sports.premierLeague.matches} />
                <BriefingStoryList stories={briefing.sports.premierLeague.headlines} empty="No Premier League headlines are available." />
              </div>
              <div>
                <h4>Belgian football</h4>
                {briefing.sports.belgianFootball.length ? (
                  <div className="briefing-story-list">
                    {briefing.sports.belgianFootball.map((story) => <BriefingStoryCard key={story.id} story={story} />)}
                  </div>
                ) : <p className="briefing-empty">No Jupiler Pro League or Rode Duivels reports are available.</p>}
              </div>
            </div>
            <p className="briefing-footnote">Scoreboard entries are labeled live, result or scheduled. Headlines are reports; no transfer-rumour or official-announcement status is inferred.</p>
          </section>

          <section className="briefing-section briefing-today">
            <h3>Today</h3>
            <div className="briefing-today-grid">
              <div>
                <h4>Agenda</h4>
                {briefing.today.agendaStatus === "not-configured"
                  ? <p className="briefing-empty">Calendar is not connected.</p>
                  : briefing.today.agendaStatus === "unavailable" || calendarWarning
                    ? <p className="briefing-empty">Calendar data is currently unavailable.</p>
                    : briefing.today.agendaEvents.length
                      ? (
                        <ul className="briefing-agenda-list">
                          {briefing.today.agendaEvents.map((event) => (
                            <li key={`${event.start}-${event.title}`}>
                              <time dateTime={event.start}>{formatTime(event.start)}</time>
                              <span><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}</span>
                            </li>
                          ))}
                        </ul>
                      )
                      : <p className="briefing-empty">No upcoming calendar events.</p>}
              </div>
              <div>
                <h4>Weather</h4>
                {briefing.today.weather ? (
                  <div className="briefing-weather">
                    <strong>{Math.round(briefing.today.weather.temperature)}° · {weatherLabel(briefing.today.weather.weatherCode, briefing.today.weather.isDay)}</strong>
                    <span>{briefing.today.weather.location} · feels like {Math.round(briefing.today.weather.apparentTemperature)}°</span>
                    <span>Wind {Math.round(briefing.today.weather.windSpeed)} km/h · humidity {briefing.today.weather.humidity}%</span>
                    <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
                  </div>
                ) : <p className="briefing-empty">Weather data is currently unavailable.</p>}
              </div>
            </div>
          </section>
          <a className="briefing-news-center-link" href="/news">
            Browse all news and filters <Icon name="arrow" size={13} />
          </a>
        </>
      ) : (
        <ResourceState loading={resource.loading} empty="The briefing is currently unavailable." />
      )}
    </Panel>
  );
}

function getNewsCategoryLabel(categoryId: string) {
  return newsCategories.find((category) => category.id === categoryId)?.label ?? categoryId;
}

function getSourceKindLabel(kind: string) {
  const labels: Record<string, string> = {
    journalism: "Independent journalism",
    "official-company": "Official company update",
    "official-institution": "Official institution update",
    "personal-blog": "Personal blog",
    "community-aggregator": "Community / aggregator",
  };
  return labels[kind] ?? "Source type unavailable";
}

function NewsWarnings({ warnings, compact = false }: { warnings: NewsResponse["warnings"]; compact?: boolean }) {
  if (!warnings.length) return null;
  const visibleWarnings = compact ? warnings.slice(0, 2) : warnings;
  return (
    <div className={`news-warnings${compact ? " is-compact" : ""}`} role="status">
      {visibleWarnings.map((warning) => (
        <p key={`${warning.sourceId}-${warning.message}`}>
          <strong>{warning.source}:</strong> {warning.message}
          {warning.stale && warning.fetchedAt && ` Last successful update ${formatPublishedDate(warning.fetchedAt)}.`}
          {warning.latestPublishedAt && ` Newest published item: ${formatPublishedDate(warning.latestPublishedAt)}.`}
        </p>
      ))}
      {warnings.length > visibleWarnings.length && <p>{warnings.length - visibleWarnings.length} more source notices.</p>}
    </div>
  );
}

function NewsCenter({
  user,
  csrfToken,
  signOutError,
  onSignOut,
}: {
  user: AuthUser;
  csrfToken: string;
  signOutError: string | null;
  onSignOut: (csrfToken: string) => void;
}) {
  const [category, setCategory] = useState<(typeof newsCategories)[number]["id"]>("belgium");
  const [sourceId, setSourceId] = useState("all");
  const [since, setSince] = useState("7d");
  const [sort, setSort] = useState("relevant");
  const [limit, setLimit] = useState(5);
  const sourceQuery = sourceId === "all" ? "" : `&source=${encodeURIComponent(sourceId)}`;
  const resource = useLiveResource<NewsResponse>(
    `/api/news?category=${category}&since=${since}&sort=${sort}&limit=${limit}${sourceQuery}`,
  );
  const articles = resource.data?.articles ?? [];
  const availableSources = resource.data?.sources ?? [];

  return (
    <main className="app-shell news-center-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Northstar home">
          <span className="brand-mark"><span /></span>
          <span className="brand-copy"><strong>northstar</strong><small>PERSONAL COMMAND CENTER</small></span>
        </a>
        <div className="topbar-right">
          <a className="news-home-link" href="/">Dashboard</a>
          <a className="news-home-link" href="/mobility">Mobility &amp; Home</a>
          <span className="account-name">{user.name || "Signed in"}</span>
          <button className="sign-out-button" onClick={() => onSignOut(csrfToken)}>Sign out</button>
        </div>
      </header>
      {signOutError && <p className="auth-inline-error">{signOutError}</p>}

      <section className="news-center-intro">
        <p className="eyebrow">NORTHSTAR · NEWS DESK</p>
        <h1>News center<span>.</span></h1>
        <p>Relevant headlines across Belgium, the world, technology, business and sport.</p>
      </section>

      <Panel title="Latest stories" eyebrow={getNewsCategoryLabel(category).toUpperCase()} icon="news" className="news-center-panel" resource={resource}>
        <div className="news-category-grid" role="group" aria-label="News category">
          {newsCategories.map((item) => (
            <button
              key={item.id}
              className={`news-category-button${category === item.id ? " is-active" : ""}`}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => {
                setLimit(5);
                setSourceId("all");
                setCategory(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="news-filters">
          <label>
            <span>Source</span>
            <select value={sourceId} onChange={(event) => {
              setLimit(5);
              setSourceId(event.target.value);
            }}>
              <option value="all">All sources</option>
              {availableSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Published</span>
            <select value={since} onChange={(event) => {
              setLimit(5);
              setSince(event.target.value);
            }}>
              <option value="24h">Past 24 hours</option>
              <option value="7d">Past 7 days</option>
              <option value="30d">Past 30 days</option>
              <option value="all">Any date</option>
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => {
              setLimit(5);
              setSort(event.target.value);
            }}>
              <option value="relevant">Most relevant</option>
              <option value="recent">Most recent</option>
            </select>
          </label>
        </div>
        <NewsWarnings warnings={resource.data?.warnings ?? []} />
        {articles.length ? (
          <div className="news-center-list">
            {articles.map((article, index) => (
              <article className="news-center-article" key={article.id || `${article.link}-${index}`}>
                <div className="news-center-article-topline">
                  <span>{getSourceKindLabel(article.sourceKind)}</span>
                  <span>{article.language.toUpperCase()}</span>
                </div>
                <a className="news-center-title" href={article.link} target="_blank" rel="noopener noreferrer">
                  {article.title}<Icon name="arrow" size={14} />
                </a>
                {article.description && <p className="news-center-description">{article.description}</p>}
                <div className="news-center-meta">
                  <span>{article.source}</span>
                  <span>{formatPublishedDate(article.publishedAt)}</span>
                </div>
                {article.coverage.length > 1 && (
                  <details className="news-coverage">
                    <summary>Also covered by {article.coverage.length - 1} other {article.coverage.length === 2 ? "source" : "sources"}</summary>
                    <ul>
                      {article.coverage
                        .filter((variant) => variant.sourceId !== article.sourceId || variant.link !== article.link)
                        .map((variant) => (
                          <li key={`${variant.sourceId}-${variant.link}`}>
                            <a href={variant.link} target="_blank" rel="noopener noreferrer">{variant.source}</a>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        ) : (
          <ResourceState loading={resource.loading} empty="No stories match these filters." />
        )}
        {resource.data?.hasMore && limit < 20 && (
          <button className="news-more-button" type="button" onClick={() => setLimit((current) => Math.min(20, current + 5))}>
            Show more stories
          </button>
        )}
        {resource.data?.hasMore && limit >= 20 && <p className="panel-footnote">Showing the maximum of 20 stories for this view.</p>}
        <p className="panel-footnote">Original headlines are shown in their published language. Links open at the source.</p>
      </Panel>
    </main>
  );
}

function ScoreRow({ event }: { event: SportsData["events"][number] }) {
  const isLive = event.state === "in";
  const status = isLive
    ? event.shortStatus || "In progress"
    : event.state === "pre"
      ? "Upcoming"
      : event.shortStatus;

  return (
    <div className="score-row">
      <div className="score-teams">
        {event.competitors.map((team) => (
          <div className={`score-team ${team.winner ? "is-winner" : ""}`} key={`${event.id}-${team.homeAway}`}>
            {team.logo ? <img src={team.logo} alt="" /> : <span className="team-placeholder">{team.abbreviation.slice(0, 2)}</span>}
            <span>{team.name}</span>
            <strong>{team.score || "—"}</strong>
          </div>
        ))}
      </div>
      <span className={`event-status${isLive ? " is-live" : ""}`}>
        <span>{isLive ? `LIVE · ${status}` : status}</span>
        <small>{formatEventTimestamp(event.date)}</small>
      </span>
    </div>
  );
}

function SportsPanel() {
  const nba = useLiveResource<SportsData>("/api/sports/nba", 5 * 60 * 1000, "/api/sports/nba?refresh=1");
  const nbaPlayers = useLiveResource<Pick<SportsData, "featuredPlayers" | "warnings">>(
    "/api/sports/nba/players",
    5 * 60 * 1000,
    "/api/sports/nba/players?refresh=1",
  );
  const premierLeague = useLiveResource<SportsData>(
    "/api/sports/premier-league",
    5 * 60 * 1000,
    "/api/sports/premier-league?refresh=1",
  );
  const belgianFootball = useLiveResource<SportsData>(
    "/api/sports/belgian-football",
    5 * 60 * 1000,
    "/api/sports/belgian-football?refresh=1",
  );
  const nbaEvents = nba.data?.events ?? [];
  const priorityNbaEvents = [...nbaEvents].sort((a, b) => {
    const statePriority = (state: typeof a.state) => state === "in" ? 0 : state === "pre" ? 1 : state === "post" ? 2 : 3;
    const stateDifference = statePriority(a.state) - statePriority(b.state);
    if (stateDifference) return stateDifference;
    const aLakers = a.competitors.some((team) => team.abbreviation === "LAL");
    const bLakers = b.competitors.some((team) => team.abbreviation === "LAL");
    if (aLakers !== bLakers) return Number(bLakers) - Number(aLakers);
    const aDate = new Date(a.date).getTime();
    const bDate = new Date(b.date).getTime();
    if (!Number.isFinite(aDate) || !Number.isFinite(bDate)) return 0;
    return a.state === "post" ? bDate - aDate : aDate - bDate;
  });
  const relevantNbaNews = (nba.data?.news ?? []).filter((item) =>
    /lakers|camara|mitchell|trail blazers/i.test(item.title),
  );
  const featuredPlayers = nbaPlayers.data?.featuredPlayers ?? [];
  const sportsResources = [nba, nbaPlayers, premierLeague, belgianFootball];
  const hasSportsData = sportsResources.some((resource) => resource.data !== null);
  const sportsResource: LiveResource<unknown> = {
    data: hasSportsData
      ? { nba: nba.data, nbaPlayers: nbaPlayers.data, premierLeague: premierLeague.data, belgianFootball: belgianFootball.data }
      : null,
    loading: !hasSportsData && sportsResources.some((resource) => resource.loading),
    refreshing: hasSportsData && sportsResources.some((resource) => resource.loading || resource.refreshing),
    error: [
      nba.error && `NBA: ${nba.error}`,
      nbaPlayers.error && `NBA player information: ${nbaPlayers.error}`,
      premierLeague.error && `Premier League: ${premierLeague.error}`,
      belgianFootball.error && `Belgian football: ${belgianFootball.error}`,
    ].filter(Boolean).join(" · ") || null,
    updatedAt: sportsResources.map((resource) => resource.updatedAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
    refresh: async () => {
      await Promise.all(sportsResources.map((resource) => resource.refresh()));
    },
  };

  return (
    <Panel title="Courtside & pitchside" eyebrow="LIVE DESK · SPORTS" icon="ball" className="sports-panel" resource={sportsResource}>
      <div className="sports-section">
        <div className="subsection-title"><span className="sport-indicator nba" />NBA <span className="subsection-note">Lakers & Belgian players</span></div>
        {nbaEvents.length ? (
          <div className="scores-list">
            {priorityNbaEvents.slice(0, 3).map((event) => <ScoreRow event={event} key={event.id} />)}
          </div>
        ) : (
          <ResourceState loading={nba.loading} empty="No NBA games scheduled right now." />
        )}
        <div className="player-links">
          <a href="https://www.espn.com/nba/team/_/name/lal/los-angeles-lakers" target="_blank" rel="noreferrer" className="player-chip"><b>LAL</b> Los Angeles Lakers <Icon name="arrow" size={12} /></a>
          {featuredPlayers.map((player) => (
            <a href={player.url} target="_blank" rel="noreferrer" className="player-chip" key={player.name}>
              <b>BE</b> {player.name} · {player.team} <Icon name="arrow" size={12} />
            </a>
          ))}
        </div>
        {relevantNbaNews.length > 0 && (
          <a className="sports-headline" href={relevantNbaNews[0].link} target="_blank" rel="noreferrer">
            <span>NBA STORY</span>{relevantNbaNews[0].title}<Icon name="arrow" size={14} />
          </a>
        )}
        {[...(nba.data?.warnings ?? []), ...(nbaPlayers.data?.warnings ?? [])].map((warning) => (
          <p className="widget-warning" key={warning}>{warning}</p>
        ))}
      </div>
      <div className="sports-section premier-section">
        <div className="subsection-title"><span className="sport-indicator premier" />Premier League <a href="https://www.premierleague.com/tables" target="_blank" rel="noreferrer">Live table <Icon name="arrow" size={12} /></a></div>
        {(premierLeague.data?.events ?? []).length ? (
          <div className="scores-list">
            {premierLeague.data!.events.slice(0, 3).map((event) => <ScoreRow event={event} key={event.id} />)}
          </div>
        ) : (
          <ResourceState loading={premierLeague.loading} empty="No Premier League matches scheduled right now." />
        )}
        {premierLeague.data?.news[0] ? (
          <a className="sports-headline premier-headline" href={premierLeague.data.news[0].link} target="_blank" rel="noreferrer">
            <span>PL NEWS</span>{premierLeague.data.news[0].title}<Icon name="arrow" size={14} />
          </a>
        ) : (
          <p className="feed-link">Premier League headlines load with the live score feed.</p>
        )}
      </div>
      <div className="sports-section premier-section">
        <div className="subsection-title"><span className="sport-indicator belgian-football" />Belgian football</div>
        {(belgianFootball.data?.news ?? []).length ? (
          <div className="belgian-football-headlines">
            {belgianFootball.data!.news.slice(0, 2).map((article) => (
              <a className="sports-headline" href={article.link} target="_blank" rel="noreferrer" key={article.id}>
                <span>{article.sportGroup === "red-devils" ? "RED DEVILS" : "JUPILER PRO LEAGUE"}</span>
                {article.title}<Icon name="arrow" size={14} />
              </a>
            ))}
          </div>
        ) : (
          <ResourceState loading={belgianFootball.loading} empty="No Jupiler Pro League or Red Devils headlines are available." />
        )}
        {(belgianFootball.data?.warnings ?? []).map((warning) => (
          <p className="widget-warning" key={warning}>{warning}</p>
        ))}
      </div>
      <p className="panel-footnote">NBA and Premier League scores from ESPN · Belgian football headlines from tagged Sporza coverage</p>
    </Panel>
  );
}

function Dashboard({
  user,
  csrfToken,
  signOutError,
  onSignOut,
}: {
  user: AuthUser;
  csrfToken: string;
  signOutError: string | null;
  onSignOut: (csrfToken: string) => void;
}) {
  const now = useClock();
  const weather = useLiveResource<WeatherData>("/api/weather", 20 * 60 * 1000, "/api/weather?refresh=1");
  const agenda = useLiveResource<CalendarData>("/api/calendar", 5 * 60 * 1000, "/api/calendar?refresh=1");
  const home = useLiveResource<HomeData>("/api/home-assistant", 5 * 60 * 1000, "/api/home-assistant?refresh=1");
  const projects = useLiveResource<Project[]>("/api/projects", 30 * 60 * 1000, "/api/projects?refresh=1");
  const date = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now), [now]);
  const time = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(now), [now]);

  const agendaEvents = agenda.data?.events ?? [];
  const homeDevices = home.data?.devices ?? [];
  const projectsList = projects.data ?? [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Northstar home">
          <span className="brand-mark"><span /></span>
          <span className="brand-copy"><strong>northstar</strong><small>PERSONAL COMMAND CENTER</small></span>
        </a>
        <div className="topbar-right">
          <div className="connection-status"><span className="status-pulse" /> PUBLIC FEEDS</div>
          <div className="topbar-divider" />
          <span className="topbar-date">{date}</span>
          <a className="news-home-link" href="/mobility">Mobility &amp; Home</a>
          <span className="account-name">{user.name || "Signed in"}</span>
          <button className="sign-out-button" onClick={() => onSignOut(csrfToken)}>Sign out</button>
        </div>
      </header>
      {signOutError && <p className="auth-inline-error">{signOutError}</p>}

      <section className="welcome-row">
        <div className="welcome-copy">
          <p className="eyebrow welcome-eyebrow">YOUR DAY, AT A GLANCE</p>
          <h1>Good {now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}<span>.</span></h1>
          <p className="welcome-subtitle">A little clarity for everything ahead.</p>
        </div>
        <div className="clock-block">
          <span className="clock-time">{time}</span>
          <span className="clock-date">{date}</span>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="Dashboard modules">
        <DailyBriefingPanel />
        <Panel title="Today, in focus" eyebrow="DAILY OVERVIEW" icon="sun" className="overview-panel" resource={weather}>
          <div className="overview-content">
            <div className="weather-card">
              <div className="weather-main">
                <span className="weather-symbol"><Icon name={weather.data && weather.data.weatherCode < 4 ? "sun" : "cloud"} size={34} /></span>
                <div>
                  {weather.data ? (
                    <>
                      <strong className="temperature">{Math.round(weather.data.temperature)}°</strong>
                      <span className="weather-condition">{weatherLabel(weather.data.weatherCode, weather.data.isDay)}</span>
                    </>
                  ) : (
                    <span className="weather-condition">{weather.loading ? "Getting the forecast…" : "Weather unavailable"}</span>
                  )}
                  <span className="weather-location">{weather.data?.location ?? "Weather"}</span>
                </div>
              </div>
              {weather.data && (
                <div className="weather-stats">
                  <div><Icon name="wind" size={15} /><span>{Math.round(weather.data.windSpeed)}<small> km/h</small></span></div>
                  <div><Icon name="drop" size={14} /><span>{weather.data.humidity}<small>% humidity</small></span></div>
                </div>
              )}
              <span className="weather-glow" />
            </div>
            <div className="overview-note">
              <span className="overline">A MOMENT TO RESET</span>
              <p>Make space for what matters. The rest can wait.</p>
              <span className="live-source">Live conditions · Open-Meteo</span>
            </div>
          </div>
        </Panel>

        <Panel title="Up next" eyebrow="YOUR AGENDA" icon="calendar" className="agenda-panel" resource={agenda}>
          {agendaEvents.length ? (
            <div className="agenda-list">
              {agendaEvents.slice(0, 4).map((event, index) => (
                <div className="agenda-item" key={`${event.start}-${event.title}`}>
                  <span className="agenda-time">{formatTime(event.start)}</span>
                  <span className={`agenda-line agenda-color-${index % 3}`} />
                  <span className="agenda-copy"><strong>{event.title}</strong><small>{event.location ?? "Calendar event"}</small></span>
                </div>
              ))}
            </div>
          ) : (
            <ResourceState loading={agenda.loading} empty="Connect a calendar to see what's coming up." />
          )}
          {agenda.error?.includes("Not configured") && <span className="setup-hint">Add a calendar URL in your local .env file</span>}
          <p className="panel-footnote">Calendar details stay private · ICS connection</p>
        </Panel>

        <SportsPanel />

        <EconomicCockpit />

        <Panel title="Home, connected" eyebrow="SMART HOME" icon="home" className="home-panel" resource={home}>
          {homeDevices.length ? (
            <>
              <div className="home-overview">
                <span className="home-count"><strong>{homeDevices.length}</strong><small>devices</small></span>
                {home.data?.temperature && <span className="home-reading"><strong>{home.data.temperature.value}{home.data.temperature.unit}</strong><small>{home.data.temperature.name}</small></span>}
                {home.data?.vacuum && <span className="home-reading"><strong>{home.data.vacuum.state}</strong><small>{home.data.vacuum.name}</small></span>}
              </div>
              <div className="device-list">
                {homeDevices.slice(0, 4).map((device) => <div key={device.name}><span className={`device-indicator ${device.state === "on" ? "device-on" : ""}`} /><span>{device.name}</span><small>{device.state}</small></div>)}
              </div>
            </>
          ) : (
            <ResourceState loading={home.loading} empty="Connect Home Assistant to see your devices." />
          )}
          {home.error?.includes("Not configured") && <span className="setup-hint">Set your Home Assistant URL and token locally</span>}
          <p className="panel-footnote">Private connection · Home Assistant</p>
        </Panel>

        <Panel title="Made by you" eyebrow="PERSONAL PROJECTS" icon="grid" className="projects-panel" resource={projects}>
          {projectsList.length ? (
            <div className="project-list">
              {projectsList.slice(0, 4).map((project) => (
                <a className="project-link" href={project.url} key={project.url} target="_blank" rel="noreferrer">
                  <span className="project-icon"><Icon name="grid" size={16} /></span>
                  <span><strong>{project.name}</strong><small>{project.description ?? "Personal project"}</small></span>
                  <Icon name="arrow" size={15} className="project-arrow" />
                </a>
              ))}
            </div>
          ) : (
            <ResourceState loading={projects.loading} empty="Your project links will live here." />
          )}
          {projects.error?.includes("Not configured") && <span className="setup-hint">Add links with PROJECTS_JSON in .env</span>}
          <p className="panel-footnote">Your links · configured locally</p>
        </Panel>
      </section>

      <footer className="page-footer">
        <span><span className="footer-orbit">✳</span> Built for a more considered day.</span>
        <span><Icon name="clock" size={13} /> Local time {time}</span>
      </footer>
    </main>
  );
}

function App() {
  const [access, setAccess] = useState<AccessState>({ status: "loading" });
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadAccess = async () => {
      try {
        const [sessionResponse, csrfResponse] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }),
          fetch("/api/auth/csrf", { cache: "no-store" }),
        ]);
        if (!sessionResponse.ok || !csrfResponse.ok) {
          throw new Error("Sign-in is unavailable. Check the server's authentication settings.");
        }
        const [session, csrf] = await Promise.all([
          sessionResponse.json() as Promise<{ user?: AuthUser } | null>,
          csrfResponse.json() as Promise<{ csrfToken?: string }>,
        ]);
        if (!csrf.csrfToken) throw new Error("Could not initialize a secure sign-in session.");
        if (!active) return;
        if (session?.user?.id) {
          setAccess({ status: "authenticated", csrfToken: csrf.csrfToken, user: session.user });
        } else {
          setAccess({ status: "unauthenticated", csrfToken: csrf.csrfToken });
        }
      } catch (error) {
        if (active) {
          setAccess({
            status: "error",
            message: error instanceof Error ? error.message : "Could not verify sign-in.",
          });
        }
      }
    };

    void loadAccess();
    const onExpired = () => {
      setAccess((current) =>
        current.status === "authenticated"
          ? { status: "unauthenticated", csrfToken: current.csrfToken }
          : current,
      );
    };
    window.addEventListener("northstar:session-expired", onExpired);
    return () => {
      active = false;
      window.removeEventListener("northstar:session-expired", onExpired);
    };
  }, []);

  async function signOut(csrfToken: string) {
    setSignOutError(null);
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, callbackUrl: window.location.origin }),
      });
      if (!response.ok) throw new Error("Sign-out failed. Please try again.");
      window.location.assign("/");
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign-out failed.");
    }
  }

  if (access.status === "loading") {
    return <main className="auth-page"><div className="auth-card"><span className="loader" />Checking your sign-in…</div></main>;
  }

  if (access.status === "error") {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <a className="brand auth-brand" href="/" aria-label="Northstar home">
            <span className="brand-mark"><span /></span>
            <span className="brand-copy"><strong>northstar</strong><small>PERSONAL COMMAND CENTER</small></span>
          </a>
          <p className="eyebrow">PRIVATE DASHBOARD</p>
          <h1>Sign-in unavailable<span>.</span></h1>
          <p className="auth-description">{access.message}</p>
        </div>
      </main>
    );
  }

  if (access.status === "unauthenticated") {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <a className="brand auth-brand" href="/" aria-label="Northstar home">
            <span className="brand-mark"><span /></span>
            <span className="brand-copy"><strong>northstar</strong><small>PERSONAL COMMAND CENTER</small></span>
          </a>
          <p className="eyebrow">PRIVATE DASHBOARD</p>
          <h1>Your home,<br />in one place<span>.</span></h1>
          <p className="auth-description">Sign in with the GitHub account authorized for this dashboard.</p>
          <a className="sign-in-button" href="/api/auth/signin">Continue with GitHub <Icon name="arrow" size={16} /></a>
          <p className="auth-note">Only the configured account can access dashboard data.</p>
        </div>
      </main>
    );
  }

  const pageProps = {
    user: access.user,
    csrfToken: access.csrfToken,
    signOutError,
    onSignOut: signOut,
  };
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/news") return <NewsCenter {...pageProps} />;
  if (path === "/mobility") return <MobilityHomePage {...pageProps} />;
  return <Dashboard {...pageProps} />;
}

export default App;
