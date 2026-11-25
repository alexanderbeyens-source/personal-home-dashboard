import { LOCALE, formatNumber } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type { DuolingoData } from "../types";
import { Panel, ResourceState } from "./Panel";

export const DUOLINGO_URL = "/api/duolingo";

function shortDate(date: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function statusText(data: DuolingoData) {
  if (data.status === "practiced") return "Vandaag geoefend";
  if (data.status === "pending") return "Vandaag nog niet geoefend";
  if (data.status === "broken") return data.lastPracticeDate ? `Streak verbroken · laatst geoefend ${shortDate(data.lastPracticeDate)}` : "Streak verbroken";
  return null;
}

export function DuolingoPanel() {
  const resource = useLiveResource<DuolingoData>(DUOLINGO_URL, 15 * 60 * 1000, `${DUOLINGO_URL}?refresh=1`);
  const data = resource.data;
  const status = data ? statusText(data) : null;
  return (
    <Panel
      title="Duolingo"
      eyebrow="Publiek profiel"
      icon="flame"
      className="duolingo-panel"
      resource={resource}
      stale={data?.stale}
      moreHref={data?.profileUrl}
      moreLabel="Profiel op Duolingo"
    >
      {data ? (
        <>
          {status && <p className={`duo-status is-${data.status}`} role="status">{status}</p>}
          <div className="metric-grid compact">
            <article className="metric-card">
              <header className="metric-head"><h4>Streak</h4></header>
              {data.streak !== null ? (
                <>
                  <p className="metric-value">{formatNumber(data.streak, 0)}<small>{data.streak === 1 ? "dag" : "dagen"}</small></p>
                  {data.streakStart && <p className="metric-period">sinds {shortDate(data.streakStart)}</p>}
                </>
              ) : (
                <p className="empty-state">Niet beschikbaar</p>
              )}
            </article>
            <article className="metric-card">
              <header className="metric-head"><h4>Totale XP</h4></header>
              {data.totalXp !== null ? (
                <>
                  <p className="metric-value">{formatNumber(data.totalXp, 0)}</p>
                  {data.currentCourse && (
                    <p className="metric-period">
                      Nu: {data.currentCourse.title}
                      {data.currentCourse.xp !== null && ` · ${formatNumber(data.currentCourse.xp, 0)} XP`}
                    </p>
                  )}
                </>
              ) : (
                <p className="empty-state">Niet beschikbaar</p>
              )}
            </article>
          </div>
          {data.courses.length > 1 && (
            <ul className="duo-courses" aria-label="Cursussen">
              {data.courses.map((course) => (
                <li key={course.id}>
                  <span>{course.title}</span>
                  {course.xp !== null && <span className="duo-xp">{formatNumber(course.xp, 0)} XP</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : resource.notConfigured ? (
        <p className="empty-state">Stel je Duolingo-gebruikersnaam in op de server (publiek profiel nodig) om je streak en XP hier te zien.</p>
      ) : (
        <ResourceState loading={resource.loading} empty="Geen Duolingo-gegevens beschikbaar." />
      )}
    </Panel>
  );
}
