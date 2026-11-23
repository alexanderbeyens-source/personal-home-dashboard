import { useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { Panel, ResourceState } from "./components/Panel";
import { useLiveResource } from "./hooks/useLiveResource";
import type {
  CalendarData,
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
  { id: "data-software", label: "Data & software" },
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

function NewsPanel() {
  const resource = useLiveResource<NewsResponse>("/api/news?view=briefing&since=7d");
  const articles = resource.data?.articles ?? [];

  return (
    <Panel title="The briefing" eyebrow="LIVE DESK · NEWS" icon="news" className="news-panel" resource={resource}>
      <NewsWarnings warnings={resource.data?.warnings ?? []} compact />
      {articles.length > 0 ? (
        <div className="news-list">
          {articles.slice(0, 5).map((article, index) => (
            <a className="news-item" href={article.link} target="_blank" rel="noreferrer" key={`${article.link}-${index}`}>
              <span className="news-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="news-copy">
                <span className="news-title">{article.title}</span>
                <span className="news-meta">{article.source} <i /> {getNewsCategoryLabel(article.category)} <i /> {formatPublishedDate(article.publishedAt)}</span>
              </span>
              <Icon name="arrow" size={15} className="news-arrow" />
            </a>
          ))}
        </div>
      ) : (
        <ResourceState loading={resource.loading} empty="No recent stories are available." />
      )}
      <a className="news-center-link" href="/news">Open the news center <Icon name="arrow" size={13} /></a>
      <p className="panel-footnote">Up to five stories across six categories · original sources linked</p>
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
  const [limit, setLimit] = useState(5);
  const sourceQuery = sourceId === "all" ? "" : `&source=${encodeURIComponent(sourceId)}`;
  const resource = useLiveResource<NewsResponse>(
    `/api/news?category=${category}&since=${since}&limit=${limit}${sourceQuery}`,
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
          <span className="account-name">{user.name || "Signed in"}</span>
          <button className="sign-out-button" onClick={() => onSignOut(csrfToken)}>Sign out</button>
        </div>
      </header>
      {signOutError && <p className="auth-inline-error">{signOutError}</p>}

      <section className="news-center-intro">
        <p className="eyebrow">NORTHSTAR · NEWS DESK</p>
        <h1>News center<span>.</span></h1>
        <p>Reliable headlines across Belgium, the world, technology, business, software and sport.</p>
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
  const nba = useLiveResource<SportsData>("/api/sports/nba");
  const nbaPlayers = useLiveResource<Pick<SportsData, "featuredPlayers" | "warnings">>("/api/sports/nba/players");
  const premierLeague = useLiveResource<SportsData>("/api/sports/premier-league");
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
  const sportsResources = [nba, nbaPlayers, premierLeague];
  const hasSportsData = sportsResources.some((resource) => resource.data !== null);
  const sportsResource: LiveResource<unknown> = {
    data: hasSportsData
      ? { nba: nba.data, nbaPlayers: nbaPlayers.data, premierLeague: premierLeague.data }
      : null,
    loading: !hasSportsData && sportsResources.some((resource) => resource.loading),
    refreshing: hasSportsData && sportsResources.some((resource) => resource.loading || resource.refreshing),
    error: [
      nba.error && `NBA: ${nba.error}`,
      nbaPlayers.error && `NBA player information: ${nbaPlayers.error}`,
      premierLeague.error && `Premier League: ${premierLeague.error}`,
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
      <p className="panel-footnote">Scores and player rosters from ESPN · live league table opens at PremierLeague.com</p>
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
  const weather = useLiveResource<WeatherData>("/api/weather", 20 * 60 * 1000);
  const agenda = useLiveResource<CalendarData>("/api/calendar");
  const finance = useLiveResource<FinanceData>("/api/finance", 60 * 60 * 1000);
  const home = useLiveResource<HomeData>("/api/home-assistant");
  const projects = useLiveResource<Project[]>("/api/projects", 30 * 60 * 1000);
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

        <NewsPanel />
        <SportsPanel />

        <Panel title="Money, in perspective" eyebrow="PERSONAL FINANCE" icon="chart" className="finance-panel" resource={finance}>
          {finance.data ? (
            <>
              <div className="finance-intro"><span className="finance-badge">EUR</span><p>Daily reference exchange rates <span>· {finance.data.date}</span></p></div>
              <div className="rates-grid">
                {Object.entries(finance.data.rates).map(([currency, value]) => (
                  <div className="rate-tile" key={currency}><span>1 EUR <Icon name="arrow" size={11} /></span><strong>{value.toFixed(3)} <small>{currency}</small></strong></div>
                ))}
              </div>
              <p className="finance-disclaimer">Public reference rates, not personal account balances. No bank connection.</p>
            </>
          ) : (
            <ResourceState loading={finance.loading} empty="Live exchange rates will appear here." />
          )}
          <p className="panel-footnote">Daily reference data · Frankfurter / ECB</p>
        </Panel>

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
  return window.location.pathname.replace(/\/+$/, "") === "/news"
    ? <NewsCenter {...pageProps} />
    : <Dashboard {...pageProps} />;
}

export default App;
