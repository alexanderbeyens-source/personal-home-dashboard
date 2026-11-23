import { useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { Panel, ResourceState } from "./components/Panel";
import { useLiveResource } from "./hooks/useLiveResource";
import type {
  CalendarData,
  FinanceData,
  HomeData,
  NewsArticle,
  Project,
  SportsData,
  WeatherData,
} from "./types";

const categories = [
  { id: "world", label: "World" },
  { id: "technology", label: "Tech & AI" },
  { id: "business", label: "Economy" },
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

function formatRelativeTime(date: string | null) {
  if (!date) return "Recently";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parsed);
}

function NewsPanel() {
  const [active, setActive] = useState<(typeof categories)[number]["id"]>("world");
  const world = useLiveResource<NewsArticle[]>("/api/news?category=world");
  const technology = useLiveResource<NewsArticle[]>("/api/news?category=technology");
  const business = useLiveResource<NewsArticle[]>("/api/news?category=business");
  const current = { world, technology, business }[active];
  const items = current.data ?? [];

  return (
    <Panel title="The briefing" eyebrow="LIVE DESK · NEWS" icon="news" className="news-panel">
      <div className="tab-row" role="tablist" aria-label="News category">
        {categories.map((category) => (
          <button
            key={category.id}
            className={`tab-button ${active === category.id ? "is-active" : ""}`}
            onClick={() => setActive(category.id)}
            role="tab"
            aria-selected={active === category.id}
          >
            {category.label}
          </button>
        ))}
      </div>
      {items.length > 0 ? (
        <div className="news-list">
          {items.slice(0, 5).map((article, index) => (
            <a className="news-item" href={article.link} target="_blank" rel="noreferrer" key={`${article.link}-${index}`}>
              <span className="news-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="news-copy">
                <span className="news-title">{article.title}</span>
                <span className="news-meta">{article.source} <i /> {formatRelativeTime(article.publishedAt)}</span>
              </span>
              <Icon name="arrow" size={15} className="news-arrow" />
            </a>
          ))}
        </div>
      ) : (
        <ResourceState loading={current.loading} error={current.error} empty="No current stories in this feed." />
      )}
      <p className="panel-footnote">Live headlines · refreshed every 5 minutes</p>
    </Panel>
  );
}

function ScoreRow({ event }: { event: SportsData["events"][number] }) {
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
      <span className={`event-status ${event.status.toLowerCase().includes("progress") ? "is-live" : ""}`}>
        {event.shortStatus}
      </span>
    </div>
  );
}

function SportsPanel() {
  const nba = useLiveResource<SportsData>("/api/sports/nba");
  const premierLeague = useLiveResource<SportsData>("/api/sports/premier-league");
  const nbaEvents = nba.data?.events ?? [];
  const priorityNbaEvents = [...nbaEvents].sort((a, b) => {
    const aLakers = a.competitors.some((team) => team.abbreviation === "LAL");
    const bLakers = b.competitors.some((team) => team.abbreviation === "LAL");
    return Number(bLakers) - Number(aLakers);
  });
  const relevantNbaNews = (nba.data?.news ?? []).filter((item) =>
    /lakers|camara|mitchell|trail blazers/i.test(item.title),
  );
  const featuredPlayers = nba.data?.featuredPlayers ?? [];

  return (
    <Panel title="Courtside & pitchside" eyebrow="LIVE DESK · SPORTS" icon="ball" className="sports-panel">
      <div className="sports-section">
        <div className="subsection-title"><span className="sport-indicator nba" />NBA <span className="subsection-note">Lakers & Belgian players</span></div>
        {nbaEvents.length ? (
          <div className="scores-list">
            {priorityNbaEvents.slice(0, 3).map((event) => <ScoreRow event={event} key={event.id} />)}
          </div>
        ) : (
          <ResourceState loading={nba.loading} error={nba.error} empty="No NBA games scheduled right now." />
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
      </div>
      <div className="sports-section premier-section">
        <div className="subsection-title"><span className="sport-indicator premier" />Premier League <a href="https://www.premierleague.com/tables" target="_blank" rel="noreferrer">Live table <Icon name="arrow" size={12} /></a></div>
        {(premierLeague.data?.events ?? []).length ? (
          <div className="scores-list">
            {premierLeague.data!.events.slice(0, 3).map((event) => <ScoreRow event={event} key={event.id} />)}
          </div>
        ) : (
          <ResourceState loading={premierLeague.loading} error={premierLeague.error} empty="No Premier League matches scheduled right now." />
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
        <Panel title="Today, in focus" eyebrow="DAILY OVERVIEW" icon="sun" className="overview-panel">
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
                    <span className="weather-condition">{weather.loading ? "Getting the forecast…" : weather.error ?? "Weather unavailable"}</span>
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
              {weather.error && !weather.loading && <button className="text-button" onClick={() => window.location.reload()}>Retry</button>}
              <span className="weather-glow" />
            </div>
            <div className="overview-note">
              <span className="overline">A MOMENT TO RESET</span>
              <p>Make space for what matters. The rest can wait.</p>
              <span className="live-source">Live conditions · Open-Meteo</span>
            </div>
          </div>
        </Panel>

        <Panel title="Up next" eyebrow="YOUR AGENDA" icon="calendar" className="agenda-panel">
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
            <ResourceState loading={agenda.loading} error={agenda.error} empty="Connect a calendar to see what's coming up." />
          )}
          {agenda.error?.includes("Not configured") && <span className="setup-hint">Add a calendar URL in your local .env file</span>}
          <p className="panel-footnote">Calendar details stay private · ICS connection</p>
        </Panel>

        <NewsPanel />
        <SportsPanel />

        <Panel title="Money, in perspective" eyebrow="PERSONAL FINANCE" icon="chart" className="finance-panel">
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
            <ResourceState loading={finance.loading} error={finance.error} empty="Live exchange rates will appear here." />
          )}
          <p className="panel-footnote">Daily reference data · Frankfurter / ECB</p>
        </Panel>

        <Panel title="Home, connected" eyebrow="SMART HOME" icon="home" className="home-panel">
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
            <ResourceState loading={home.loading} error={home.error} empty="Connect Home Assistant to see your devices." />
          )}
          {home.error?.includes("Not configured") && <span className="setup-hint">Set your Home Assistant URL and token locally</span>}
          <p className="panel-footnote">Private connection · Home Assistant</p>
        </Panel>

        <Panel title="Made by you" eyebrow="PERSONAL PROJECTS" icon="grid" className="projects-panel">
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
            <ResourceState loading={projects.loading} error={projects.error} empty="Your project links will live here." />
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

  return (
    <Dashboard
      user={access.user}
      csrfToken={access.csrfToken}
      signOutError={signOutError}
      onSignOut={signOut}
    />
  );
}

export default App;
