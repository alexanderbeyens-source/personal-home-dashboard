import { useEffect, useMemo, useState } from "react";
import { AppShell, type PageProps } from "../components/AppShell";
import { CompactStory } from "../components/briefing";
import { ImieCard, MetricCard, PolicyRateCard } from "../components/economy";
import { Icon } from "../components/Icon";
import { ImieChart } from "../components/ImieChart";
import { Panel, ResourceState, SectionTitle } from "../components/Panel";
import { FixtureList, LeagueTabs, PlayerLines, StandingsTable, isLeagueId, leagueLabel } from "../components/sports";
import { LOCALE, formatNumber, formatTime, weatherLabel } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type {
  CalendarData,
  DailyBriefing,
  EconomicData,
  FinanceData,
  HomeData,
  LiveResource,
  Project,
  SportLeagueId,
  SportOverview,
  WeatherData,
} from "../types";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function BriefingSummary() {
  const resource = useLiveResource<DailyBriefing>("/api/briefing", 15 * 60 * 1000, "/api/briefing?refresh=1");
  const stories = resource.data?.topStories.slice(0, 3) ?? [];
  return (
    <Panel
      title="Dagelijkse briefing"
      eyebrow="Top 3 van vandaag"
      icon="news"
      className="span-8 briefing-summary"
      resource={resource}
      stale={resource.data?.stale}
      moreHref="/briefing"
      moreLabel="Volledige briefing"
    >
      {stories.length ? (
        <ol className="compact-story-list">
          {stories.map((story, index) => <CompactStory key={story.id} story={story} rank={index + 1} />)}
        </ol>
      ) : (
        <ResourceState loading={resource.loading} empty="De actieve feeds hebben geen recente artikels." />
      )}
    </Panel>
  );
}

function WeatherPanel() {
  const weather = useLiveResource<WeatherData>("/api/weather", 20 * 60 * 1000, "/api/weather?refresh=1");
  const data = weather.data;
  return (
    <Panel title="Weer" eyebrow={data?.location ?? "Locatie"} icon={data && data.weatherCode < 4 ? "sun" : "cloud"} className="weather-panel" resource={weather}>
      {data ? (
        <div className="weather">
          <p className="weather-temp">{Math.round(data.temperature)}°</p>
          <div>
            <p className="weather-label">{weatherLabel(data.weatherCode, data.isDay)}</p>
            <p className="weather-detail">Voelt als {Math.round(data.apparentTemperature)}°</p>
            <p className="weather-detail">
              <Icon name="wind" size={15} className="inline-icon" /> {Math.round(data.windSpeed)} km/u
              <span aria-hidden="true"> · </span>
              <Icon name="drop" size={14} className="inline-icon" /> {data.humidity}%
            </p>
          </div>
        </div>
      ) : (
        <ResourceState loading={weather.loading} empty="Weergegevens zijn momenteel niet beschikbaar." />
      )}
      <p className="panel-source">Open-Meteo</p>
    </Panel>
  );
}

function AgendaPanel() {
  const agenda = useLiveResource<CalendarData>("/api/calendar", 5 * 60 * 1000, "/api/calendar?refresh=1");
  const events = agenda.data?.events ?? [];
  return (
    <Panel title="Agenda" eyebrow="Komende afspraken" icon="calendar" className="agenda-panel" resource={agenda}>
      {events.length ? (
        <ul className="agenda-list">
          {events.slice(0, 4).map((event) => (
            <li key={`${event.start}-${event.title}`}>
              <time dateTime={event.start}>{formatTime(event.start)}</time>
              <span><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}</span>
            </li>
          ))}
        </ul>
      ) : agenda.notConfigured ? (
        <p className="empty-state">Voeg de privé-ICS-feed van je agenda toe aan de serveromgeving om je afspraken hier te zien.</p>
      ) : (
        <ResourceState loading={agenda.loading} empty="Geen komende afspraken." />
      )}
    </Panel>
  );
}

const SPORT_TAB_KEY = "northstar.sport-tab";

function storedLeague(): SportLeagueId {
  try {
    const value = window.localStorage.getItem(SPORT_TAB_KEY);
    return isLeagueId(value) ? value : "nba";
  } catch {
    return "nba";
  }
}

function SportWidget() {
  const [league, setLeague] = useState<SportLeagueId>(storedLeague);
  const resource = useLiveResource<SportOverview>(`/api/sport/${league}/overview`, 2 * 60 * 1000, `/api/sport/${league}/overview?refresh=1`);
  const data = resource.data?.league.id === league ? resource.data : null;
  const isNba = league === "nba";
  const select = (next: SportLeagueId) => {
    setLeague(next);
    try {
      window.localStorage.setItem(SPORT_TAB_KEY, next);
    } catch {
      // Storage can be unavailable in private browsing; the tab still works.
    }
  };

  return (
    <Panel
      title="Sport"
      eyebrow={leagueLabel(league)}
      icon="ball"
      className="span-7 sport-widget"
      resource={resource as LiveResource<unknown>}
      stale={data?.stale}
      moreHref={`/sport/${league}`}
      moreLabel={`Alles over ${leagueLabel(league)}`}
      headerExtra={<LeagueTabs active={league} onSelect={select} controls="sport-widget-body" />}
    >
      <div id="sport-widget-body" role="tabpanel">
        {data ? (
          <>
            {data.live.length > 0 && (
              <div className="sport-block">
                <SectionTitle>Nu live</SectionTitle>
                <FixtureList events={data.live} empty="" label="Live wedstrijden" compact />
              </div>
            )}
            <div className="sport-grid">
              <div className="sport-block">
                <SectionTitle>Gespeeld</SectionTitle>
                <FixtureList events={data.past} empty="Geen recente uitslagen." label="Gespeelde wedstrijden" compact />
              </div>
              <div className="sport-block">
                <SectionTitle>Komend</SectionTitle>
                <FixtureList events={data.upcoming} empty="Geen geplande wedstrijden in deze periode." label="Komende wedstrijden" compact />
              </div>
              <div className="sport-block sport-standings">
                <SectionTitle aside={data.standings && <span className="section-aside">{isNba ? data.standings.name.replace("Western Conference", "Westen").replace("Eastern Conference", "Oosten") : "Top 5"}</span>}>
                  Stand
                </SectionTitle>
                {data.standings
                  ? <StandingsTable group={data.standings} isNba={isNba} compact />
                  : <p className="empty-state">Stand momenteel niet beschikbaar.</p>}
              </div>
            </div>
            {isNba && data.players.length > 0 && (
              <div className="sport-block">
                <SectionTitle>Belgen in de NBA · laatste wedstrijd</SectionTitle>
                <PlayerLines players={data.players} />
              </div>
            )}
          </>
        ) : (
          <ResourceState loading={resource.loading || resource.data?.league.id !== league} empty="Sportgegevens zijn momenteel niet beschikbaar." />
        )}
      </div>
    </Panel>
  );
}

function EconomySummary() {
  const economics = useLiveResource<EconomicData>("/api/economy", 2 * 60 * 1000, "/api/economy?refresh=1");
  const finance = useLiveResource<FinanceData>("/api/finance", 60 * 60 * 1000, "/api/finance?refresh=1");
  const data = economics.data;
  const deposit = data?.policyRates?.rates.find((rate) => rate.id === "deposit") ?? null;
  const usd = finance.data?.rates.USD;
  return (
    <Panel
      title="Economie"
      eyebrow="Markten & indicatoren"
      icon="chart"
      className="span-5 economy-summary"
      resource={economics as LiveResource<unknown>}
      moreHref="/economie"
      moreLabel="Alle economische data"
    >
      <ImieCard data={data} />
      <ImieChart compact defaultRange="1m" />
      <div className="metric-grid compact">
        {deposit ? <PolicyRateCard rate={deposit} compact /> : <MetricCard title="ECB-depositorente" metric={null} compact />}
        <MetricCard title="Inflatie België" metric={data?.belgiumInflation ?? null} compact />
        <MetricCard title="Inflatie eurozone" metric={data?.euroAreaInflation ?? null} compact />
        <article className="metric-card">
          <header className="metric-head"><h4>EUR/USD</h4></header>
          {usd !== undefined
            ? <><p className="metric-value">{formatNumber(usd, 4)}</p><p className="metric-period">ECB-referentiekoers</p></>
            : <p className="empty-state">Momenteel niet beschikbaar</p>}
        </article>
      </div>
    </Panel>
  );
}

function OptionalPanels() {
  const home = useLiveResource<HomeData>("/api/home-assistant", 5 * 60 * 1000, "/api/home-assistant?refresh=1");
  const projects = useLiveResource<Project[]>("/api/projects", 30 * 60 * 1000, "/api/projects?refresh=1");
  const devices = home.data?.devices ?? [];
  const projectList = projects.data ?? [];
  // Optional integrations outside the core product scope stay hidden until they are configured.
  const showHome = home.data !== null || (home.error !== null && !home.notConfigured);
  const showProjects = projectList.length > 0 || projects.error !== null;
  if (!showHome && !showProjects) return null;
  return (
    <>
      {showHome && (
        <Panel title="Thuis, verbonden" eyebrow="Slim huis" icon="home" className="span-6" resource={home}>
          {devices.length ? (
            <ul className="device-list">
              {devices.slice(0, 6).map((device) => (
                <li key={device.name}><span>{device.name}</span><strong>{device.state}</strong></li>
              ))}
            </ul>
          ) : (
            <ResourceState loading={home.loading} empty="Koppel Home Assistant om je toestellen te zien." />
          )}
        </Panel>
      )}
      {showProjects && (
        <Panel title="Door jou gemaakt" eyebrow="Persoonlijke projecten" icon="grid" className="span-6" resource={projects}>
          {projectList.length ? (
            <ul className="link-list">
              {projectList.slice(0, 4).map((project) => (
                <li key={project.url}>
                  <a href={project.url} target="_blank" rel="noreferrer"><strong>{project.name}</strong><small>{project.description ?? "Persoonlijk project"}</small></a>
                </li>
              ))}
            </ul>
          ) : (
            <ResourceState loading={projects.loading} empty="Hier komen je projectlinks." />
          )}
        </Panel>
      )}
    </>
  );
}

export function Dashboard(props: PageProps) {
  const now = useClock();
  const greeting = now.getHours() < 12 ? "Goedemorgen" : now.getHours() < 18 ? "Goedemiddag" : "Goedenavond";
  const date = useMemo(() => {
    const text = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(now);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [now]);
  return (
    <AppShell {...props} title={`${greeting}.`} intro={<p>{date} · {formatTime(now)}</p>}>
      <div className="dashboard-grid">
        <BriefingSummary />
        <div className="span-4 side-stack">
          <WeatherPanel />
          <AgendaPanel />
        </div>
        <SportWidget />
        <EconomySummary />
        <OptionalPanels />
      </div>
    </AppShell>
  );
}
