import { AppShell, type PageProps } from "../components/AppShell";
import { BriefingMatches, StoryCard, StoryList } from "../components/briefing";
import { Panel, ResourceState, SectionTitle } from "../components/Panel";
import { formatEconomicPeriod, formatNumber, formatPublishedDate, formatTime, weatherLabel } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type { DailyBriefing } from "../types";

function Warnings({ warnings }: { warnings: DailyBriefing["warnings"] }) {
  if (!warnings.length) return null;
  return (
    <div className="notice-list" role="status">
      {warnings.slice(0, 6).map((warning) => (
        <p key={`${warning.source}-${warning.message}`}>
          <strong>{warning.source}:</strong> {warning.message}
          {warning.stale ? " Gecachete gegevens worden getoond waar beschikbaar." : ""}
        </p>
      ))}
      {warnings.length > 6 && <p>{warnings.length - 6} andere bronmeldingen.</p>}
    </div>
  );
}

export function BriefingPage(props: PageProps) {
  const resource = useLiveResource<DailyBriefing>("/api/briefing", 15 * 60 * 1000, "/api/briefing?refresh=1");
  const briefing = resource.data;
  const calendarWarning = briefing?.warnings.some((warning) => warning.source === "Agenda · ICS");

  return (
    <AppShell
      {...props}
      title="Dagelijkse briefing"
      intro={briefing
        ? <p>Gegenereerd {formatPublishedDate(briefing.generatedAt)} · 15 minuten gecachet{briefing.stale ? " · de laatste geslaagde versie wordt getoond" : ""}</p>
        : <p>Een beknopte, deterministische selectie uit je bronnen.</p>}
    >
      {!briefing ? (
        <Panel title="Briefing" icon="news" resource={resource}>
          <ResourceState loading={resource.loading} empty="De briefing is momenteel niet beschikbaar." />
        </Panel>
      ) : (
        <div className="page-grid">
          <Warnings warnings={briefing.warnings} />
          <Panel title="Hoofdnieuws" eyebrow={`${briefing.topStories.length} geselecteerd · maximaal 5`} icon="news" className="span-12" resource={resource} stale={briefing.stale}>
            {briefing.topStories.length ? (
              <div className="story-grid">
                {briefing.topStories.map((story) => <StoryCard key={story.id} story={story} featured />)}
              </div>
            ) : (
              <p className="empty-state">De actieve feeds hebben geen recente artikels.</p>
            )}
          </Panel>

          <Panel title="België & internationaal" icon="news" className="span-4" resource={resource}>
            <StoryList stories={briefing.sections.belgiumInternational} empty="Geen bijkomend Belgisch of internationaal nieuws naast het hoofdnieuws." />
          </Panel>
          <Panel title="Technologie & AI" icon="grid" className="span-4" resource={resource}>
            <StoryList stories={briefing.sections.technology} empty="Geen bijkomend technologienieuws naast het hoofdnieuws." />
          </Panel>
          <Panel title="Economie & business" icon="chart" className="span-4" resource={resource} moreHref="/economie" moreLabel="Alle economische data">
            <StoryList stories={briefing.economy.stories} empty="Geen bijkomend economisch nieuws naast het hoofdnieuws." />
            {briefing.economy.indicatorDevelopments.length > 0 && (
              <div className="sub-block">
                <SectionTitle>Officiële indicatoren</SectionTitle>
                {briefing.economy.indicatorDevelopments.map((development) => (
                  <article key={development.id} className="indicator-update">
                    <h4>{development.title}</h4>
                    <p>{development.summary}</p>
                    <a className="source-link" href={development.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {development.source} · {formatEconomicPeriod(development.period)}
                    </a>
                  </article>
                ))}
              </div>
            )}
            <div className="sub-block">
              <SectionTitle>Referentiekoersen</SectionTitle>
              {briefing.economy.referenceRates ? (
                <p className="rate-row">
                  {Object.entries(briefing.economy.referenceRates.rates).map(([currency, value]) => (
                    <span key={currency}><small>EUR/{currency}</small> {formatNumber(value, 3)}</span>
                  ))}
                </p>
              ) : <p className="empty-state">Referentiekoersen zijn momenteel niet beschikbaar.</p>}
            </div>
          </Panel>

          <Panel title="Sport" icon="ball" className="span-8" resource={resource} moreHref="/sport" moreLabel="Naar sport">
            <div className="briefing-sport-grid">
              <div>
                <SectionTitle>NBA</SectionTitle>
                <BriefingMatches matches={briefing.sports.nba.matches} />
                <StoryList stories={briefing.sports.nba.headlines} empty="Geen NBA-nieuws beschikbaar." />
              </div>
              <div>
                <SectionTitle>Premier League</SectionTitle>
                <BriefingMatches matches={briefing.sports.premierLeague.matches} />
                <StoryList stories={briefing.sports.premierLeague.headlines} empty="Geen Premier League-nieuws beschikbaar." />
              </div>
              <div>
                <SectionTitle>Belgisch voetbal</SectionTitle>
                <StoryList stories={briefing.sports.belgianFootball} empty="Geen nieuws over de Jupiler Pro League of de Rode Duivels beschikbaar." />
              </div>
            </div>
          </Panel>

          <Panel title="Vandaag" icon="calendar" className="span-4" resource={resource}>
            <SectionTitle>Agenda</SectionTitle>
            {briefing.today.agendaStatus === "not-configured"
              ? <p className="empty-state">De agenda is niet gekoppeld.</p>
              : briefing.today.agendaStatus === "unavailable" || calendarWarning
                ? <p className="empty-state">Agendagegevens zijn momenteel niet beschikbaar.</p>
                : briefing.today.agendaEvents.length
                  ? (
                    <ul className="agenda-list">
                      {briefing.today.agendaEvents.map((event) => (
                        <li key={`${event.start}-${event.title}`}>
                          <time dateTime={event.start}>{formatTime(event.start)}</time>
                          <span><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}</span>
                        </li>
                      ))}
                    </ul>
                  )
                  : <p className="empty-state">Geen komende afspraken.</p>}
            <SectionTitle>Weer</SectionTitle>
            {briefing.today.weather ? (
              <p className="weather-line">
                <strong>{Math.round(briefing.today.weather.temperature)}° · {weatherLabel(briefing.today.weather.weatherCode, briefing.today.weather.isDay)}</strong>
                <span>{briefing.today.weather.location} · voelt als {Math.round(briefing.today.weather.apparentTemperature)}° · wind {Math.round(briefing.today.weather.windSpeed)} km/u</span>
              </p>
            ) : <p className="empty-state">Weergegevens zijn momenteel niet beschikbaar.</p>}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
