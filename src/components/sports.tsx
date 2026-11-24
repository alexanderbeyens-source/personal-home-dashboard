import { formatDay, formatMatchDate, formatTime } from "../format";
import type { FeaturedPlayerLine, ScoreEvent, SportLeagueId, StandingEntry, StandingGroup } from "../types";

export const LEAGUES: { id: SportLeagueId; label: string; short: string }[] = [
  { id: "nba", label: "NBA", short: "NBA" },
  { id: "pro-league", label: "Jupiler Pro League", short: "Pro League" },
  { id: "premier-league", label: "Premier League", short: "Premier League" },
];

export function leagueLabel(id: SportLeagueId) {
  return LEAGUES.find((league) => league.id === id)?.label ?? id;
}

export function isLeagueId(value: string | null | undefined): value is SportLeagueId {
  return LEAGUES.some((league) => league.id === value);
}

export function LeagueTabs({
  active,
  onSelect,
  hrefFor,
  controls,
}: {
  active: SportLeagueId;
  onSelect?: (league: SportLeagueId) => void;
  hrefFor?: (league: SportLeagueId) => string;
  controls?: string;
}) {
  return (
    <div className="league-tabs" role="tablist" aria-label="Competitie">
      {LEAGUES.map((league) => {
        const selected = league.id === active;
        const content = (
          <>
            <span className={`league-badge league-${league.id}`} aria-hidden="true" />
            {league.short}
          </>
        );
        return hrefFor ? (
          <a
            key={league.id}
            role="tab"
            aria-selected={selected}
            className={`league-tab${selected ? " is-active" : ""}`}
            href={hrefFor(league.id)}
          >
            {content}
          </a>
        ) : (
          <button
            key={league.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={controls}
            className={`league-tab${selected ? " is-active" : ""}`}
            onClick={() => onSelect?.(league.id)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function TeamName({ team, compact }: { team: ScoreEvent["competitors"][number]; compact: boolean }) {
  return (
    <span className="fixture-team-name">
      {team.logo ? <img src={team.logo} alt="" width={20} height={20} loading="lazy" /> : <span className="team-dot" aria-hidden="true" />}
      <span className={compact ? "team-label-short" : undefined}>{team.name}</span>
    </span>
  );
}

export function FixtureRow({ event, compact = false }: { event: ScoreEvent; compact?: boolean }) {
  const home = event.competitors.find((team) => team.homeAway === "home") ?? event.competitors[0];
  const away = event.competitors.find((team) => team !== home) ?? event.competitors[1];
  if (!home || !away) return null;
  const isLive = event.state === "in";
  const isPast = event.state === "post";
  const showScore = isLive || isPast;
  return (
    <li className={`fixture${isLive ? " is-live" : ""}`}>
      <div className="fixture-when">
        {isLive ? (
          <span className="live-pill"><span className="live-dot" aria-hidden="true" />LIVE</span>
        ) : (
          <>
            <span>{formatDay(event.date)}</span>
            <span className="fixture-time">{isPast ? event.shortStatus || "Einde" : formatTime(event.date)}</span>
          </>
        )}
      </div>
      <div className="fixture-teams">
        {[home, away].map((team) => (
          <div className={`fixture-team${isPast && team.winner ? " is-winner" : ""}`} key={`${event.id}-${team.homeAway || team.name}`}>
            <TeamName team={team} compact={compact} />
            {showScore && <strong className="score">{team.score || "—"}</strong>}
          </div>
        ))}
      </div>
      {isLive && <span className="fixture-status">{event.shortStatus}</span>}
    </li>
  );
}

export function FixtureList({ events, empty, compact = false, label }: { events: ScoreEvent[]; empty: string; compact?: boolean; label: string }) {
  if (!events.length) return <p className="empty-state">{empty}</p>;
  return (
    <ul className="fixture-list" aria-label={label}>
      {events.map((event) => <FixtureRow key={event.id} event={event} compact={compact} />)}
    </ul>
  );
}

function recordFor(entry: StandingEntry) {
  if (entry.wins === null || entry.losses === null) return "—";
  return `${entry.wins}-${entry.losses}`;
}

export function StandingsTable({ group, isNba, compact = false }: { group: StandingGroup; isNba: boolean; compact?: boolean }) {
  return (
    <div className="table-scroll">
      <table className={`standings${compact ? " is-compact" : ""}`}>
        <caption className="visually-hidden">Stand {group.name}</caption>
        <thead>
          <tr>
            <th scope="col" className="num">#</th>
            <th scope="col">Ploeg</th>
            {isNba ? (
              <>
                <th scope="col" className="num">W-V</th>
                <th scope="col" className="num">%</th>
                {!compact && <th scope="col" className="num">Achter</th>}
                {!compact && <th scope="col" className="num">Reeks</th>}
              </>
            ) : (
              <>
                <th scope="col" className="num">G</th>
                {!compact && <th scope="col" className="num">W</th>}
                {!compact && <th scope="col" className="num">G</th>}
                {!compact && <th scope="col" className="num">V</th>}
                <th scope="col" className="num">DS</th>
                <th scope="col" className="num">Ptn</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {group.entries.map((entry, index) => {
            const gap = index > 0 && entry.rank - group.entries[index - 1].rank > 1;
            return (
              <tr key={entry.teamId} className={`${entry.focus ? "is-focus" : ""}${gap ? " has-gap" : ""}`}>
                <td className="num rank">{entry.rank}</td>
                <th scope="row">
                  <span className="standing-team">
                    {entry.logo ? <img src={entry.logo} alt="" width={20} height={20} loading="lazy" /> : <span className="team-dot" aria-hidden="true" />}
                    <span>{compact ? entry.shortName : entry.name}</span>
                    {entry.focus && <span className="focus-tag">volgend</span>}
                  </span>
                </th>
                {isNba ? (
                  <>
                    <td className="num">{recordFor(entry)}</td>
                    <td className="num">{entry.winPercent ?? "—"}</td>
                    {!compact && <td className="num">{entry.gamesBehind ?? "—"}</td>}
                    {!compact && <td className="num">{entry.streak ?? "—"}</td>}
                  </>
                ) : (
                  <>
                    <td className="num">{entry.gamesPlayed ?? "—"}</td>
                    {!compact && <td className="num">{entry.wins ?? "—"}</td>}
                    {!compact && <td className="num">{entry.ties ?? "—"}</td>}
                    {!compact && <td className="num">{entry.losses ?? "—"}</td>}
                    <td className="num">{entry.goalDifference === null ? "—" : entry.goalDifference > 0 ? `+${entry.goalDifference}` : entry.goalDifference}</td>
                    <td className="num points">{entry.points ?? "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerLines({ players }: { players: FeaturedPlayerLine[] }) {
  if (!players.length) return null;
  return (
    <ul className="player-lines" aria-label="Belgische spelers in de NBA">
      {players.map((player) => (
        <li key={player.name} className="player-line">
          <div className="player-head">
            <span className="flag-be" aria-hidden="true" />
            {player.profile
              ? <a href={player.profile} target="_blank" rel="noopener noreferrer"><strong>{player.name}</strong></a>
              : <strong>{player.name}</strong>}
            {player.team && <span className="player-team">{player.team}</span>}
          </div>
          {player.lastGame ? (
            <p className="player-stats">
              <span className="stat"><strong>{player.lastGame.points ?? "—"}</strong> ptn</span>
              <span className="stat"><strong>{player.lastGame.rebounds ?? "—"}</strong> reb</span>
              <span className="stat"><strong>{player.lastGame.assists ?? "—"}</strong> ast</span>
              <span className="stat"><strong>{player.lastGame.minutes ?? "—"}</strong> min</span>
              <span className="player-game">
                {player.lastGame.result === "W" ? "Winst" : player.lastGame.result === "L" ? "Verlies" : ""}
                {player.lastGame.score ? ` ${player.lastGame.score}` : ""}
                {player.lastGame.opponent ? ` ${player.lastGame.atVs === "@" ? "bij" : "tegen"} ${player.lastGame.opponent}` : ""}
                {" · "}{formatMatchDate(player.lastGame.date)}
              </span>
            </p>
          ) : (
            <p className="empty-state">Geen recente wedstrijdstatistieken beschikbaar.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
