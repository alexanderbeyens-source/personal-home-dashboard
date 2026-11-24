import { LOCALE, formatNumber } from "../format";
import type { HealthActivity, HealthData, HealthMetricId } from "../types";
import { Sparkline } from "./economy";

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours} u ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}

export const HEALTH_METRICS: { id: HealthMetricId; title: string; unit: string; format: (value: number) => string; dayLabel: string }[] = [
  { id: "sleepSeconds", title: "Slaap", unit: "", format: formatDuration, dayLabel: "nacht" },
  { id: "sleepScore", title: "Slaapscore", unit: "/100", format: (value) => formatNumber(value, 0), dayLabel: "nacht" },
  { id: "restingHr", title: "Rusthartslag", unit: "bpm", format: (value) => formatNumber(value, 0), dayLabel: "dag" },
  { id: "hrv", title: "HRV", unit: "ms", format: (value) => formatNumber(value, 0), dayLabel: "nacht" },
  { id: "steps", title: "Stappen", unit: "", format: (value) => formatNumber(value, 0), dayLabel: "dag" },
];

function relativeDay(date: string, today: string) {
  if (date === today) return "vandaag";
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "gisteren";
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

export function HealthMetricCard({ data, metric, days = 7 }: { data: HealthData; metric: (typeof HEALTH_METRICS)[number]; days?: number }) {
  const summary = data.summary[metric.id];
  const history = data.days
    .slice(-days)
    .filter((day) => day[metric.id] !== null)
    .map((day) => ({ period: day.date, value: day[metric.id] as number }));
  return (
    <article className="metric-card health-card">
      <header className="metric-head"><h4>{metric.title}</h4></header>
      {summary.value !== null && summary.date ? (
        <>
          <p className="metric-value">{metric.format(summary.value)}{metric.unit && <small>{metric.unit}</small>}</p>
          <p className="metric-period">
            {relativeDay(summary.date, data.today)}
            {summary.average7d !== null && ` · gem. 7 d ${metric.format(summary.average7d)}`}
          </p>
          <Sparkline history={history} label={metric.title} />
        </>
      ) : (
        <p className="empty-state">Niet beschikbaar</p>
      )}
    </article>
  );
}

const ACTIVITY_TYPES: Record<string, string> = {
  Run: "Lopen", Ride: "Fietsen", VirtualRide: "Virtueel fietsen", Walk: "Wandelen", Hike: "Wandeltocht",
  Swim: "Zwemmen", WeightTraining: "Krachttraining", Workout: "Training", Yoga: "Yoga", Rowing: "Roeien",
  TrailRun: "Traillopen", EBikeRide: "E-bike", Elliptical: "Crosstrainer",
};

export function ActivityList({ activities }: { activities: HealthActivity[] }) {
  return (
    <ul className="activity-list">
      {activities.map((activity) => {
        const type = activity.type ? ACTIVITY_TYPES[activity.type] ?? activity.type : "Activiteit";
        const facts = [
          activity.movingSeconds !== null ? formatDuration(activity.movingSeconds) : null,
          activity.distanceMeters !== null ? `${formatNumber(activity.distanceMeters / 1000, 1)} km` : null,
          activity.averageHr !== null ? `gem. ${formatNumber(activity.averageHr, 0)} bpm` : null,
        ].filter(Boolean);
        return (
          <li key={activity.id}>
            <span className="activity-date">{new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(new Date(activity.start))}</span>
            <span className="activity-body">
              <strong>{activity.name ?? type}</strong>
              <small>{[activity.name ? type : null, ...facts].filter(Boolean).join(" · ")}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
