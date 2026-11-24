import { AppShell, currentPath, type PageProps } from "../components/AppShell";
import { Icon } from "../components/Icon";
import { Panel, ResourceState } from "../components/Panel";
import { FixtureList, LeagueTabs, PlayerLines, StandingsTable, isLeagueId, leagueLabel } from "../components/sports";
import { formatPublishedDate } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type { SportDetail, SportLeagueId } from "../types";

function groupLabel(name: string) {
  if (name === "Western Conference") return "Westen";
  if (name === "Eastern Conference") return "Oosten";
  return name;
}

export function SportPage(props: PageProps) {
  const segment = currentPath().split("/")[2];
  const league: SportLeagueId = isLeagueId(segment) ? segment : "nba";
  const resource = useLiveResource<SportDetail>(`/api/sport/${league}`, 2 * 60 * 1000, `/api/sport/${league}?refresh=1`);
  const data = resource.data;
  const isNba = league === "nba";
  const groups = isNba
    ? [...(data?.standings ?? [])].sort((first, second) =>
      Number(second.name === "Western Conference") - Number(first.name === "Western Conference"))
    : data?.standings ?? [];

  return (
    <AppShell
      {...props}
      title={leagueLabel(league)}
      intro={<LeagueTabs active={league} hrefFor={(id) => `/sport/${id}`} />}
    >
      {data?.warnings.length ? (
        <div className="notice-list" role="status">
          {data.warnings.map((warning) => <p key={`${warning.source}-${warning.message}`}><strong>{warning.source}:</strong> {warning.message}</p>)}
        </div>
      ) : null}
      <div className="page-grid">
        {data?.live.length ? (
          <Panel title="Nu live" icon="ball" className="span-12" resource={resource}>
            <FixtureList events={data.live} empty="" label="Live wedstrijden" />
          </Panel>
        ) : null}

        <Panel title="Stand" eyebrow={isNba ? "Conferences" : "Volledig klassement"} icon="trophy" className="span-7" resource={resource} stale={data?.stale}>
          {groups.length ? (
            <div className="standings-stack">
              {groups.map((group) => (
                <section key={group.name} aria-label={groupLabel(group.name)}>
                  {groups.length > 1 && <h3 className="group-title">{groupLabel(group.name)}</h3>}
                  <StandingsTable group={group} isNba={isNba} />
                </section>
              ))}
              {data && <a className="source-link" href={data.league.standingsLink} target="_blank" rel="noopener noreferrer">Officiële stand <Icon name="arrow" size={13} className="inline-icon" /></a>}
            </div>
          ) : (
            <ResourceState loading={resource.loading} empty="Stand momenteel niet beschikbaar." />
          )}
        </Panel>

        <div className="span-5 side-stack">
          {isNba && (data?.players.length ?? 0) > 0 && (
            <Panel title="Belgen in de NBA" eyebrow="Laatste wedstrijd" icon="trend" resource={resource}>
              <PlayerLines players={data!.players} />
            </Panel>
          )}
          <Panel title="Komend" eyebrow={isNba ? "Komende 3 dagen" : "Deze en volgende maand"} icon="calendar" resource={resource}>
            {data ? <FixtureList events={data.upcoming} empty="Geen geplande wedstrijden in deze periode." label="Komende wedstrijden" initial={8} /> : <ResourceState loading={resource.loading} empty="Wedstrijden momenteel niet beschikbaar." />}
          </Panel>
          <Panel title="Gespeeld" eyebrow={isNba ? "Afgelopen 3 dagen" : "Recente speeldagen"} icon="clock" resource={resource}>
            {data ? <FixtureList events={data.past} empty="Geen recente uitslagen." label="Gespeelde wedstrijden" initial={8} /> : <ResourceState loading={resource.loading} empty="Uitslagen momenteel niet beschikbaar." />}
          </Panel>
        </div>

        <Panel title="Nieuws" eyebrow={league === "pro-league" ? "Sporza en ESPN" : league === "premier-league" ? "BBC Sport en ESPN" : "ESPN"} icon="news" className="span-12" resource={resource}>
          {data?.news.length ? (
            <ul className="news-list">
              {data.news.map((article) => (
                <li key={article.id || article.link} className="news-item">
                  <a className="story-title" href={article.link} target="_blank" rel="noopener noreferrer">{article.title}</a>
                  {article.description && <p className="story-summary clamp-2">{article.description}</p>}
                  <p className="story-meta"><span>{article.source}</span><span aria-hidden="true">·</span><time dateTime={article.publishedAt ?? undefined}>{formatPublishedDate(article.publishedAt)}</time></p>
                </li>
              ))}
            </ul>
          ) : (
            <ResourceState loading={resource.loading} empty="Geen recent nieuws over deze competitie." />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
