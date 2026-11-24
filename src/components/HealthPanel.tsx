import { useLiveResource } from "../hooks/useLiveResource";
import type { HealthData } from "../types";
import { ActivityList, HEALTH_METRICS, HealthMetricCard } from "./health";
import { Panel, ResourceState } from "./Panel";

export const HEALTH_URL = "/api/health";

export function HealthPanel() {
  const resource = useLiveResource<HealthData>(HEALTH_URL, 30 * 60 * 1000, `${HEALTH_URL}?refresh=1`);
  const data = resource.data;
  return (
    <Panel
      title="Gezondheid"
      eyebrow="Garmin · intervals.icu"
      icon="heart"
      className="health-panel"
      resource={resource}
      stale={data?.stale}
      moreHref={data ? "/gezondheid" : undefined}
      moreLabel="Alle gezondheidsdata"
    >
      {data ? (
        <>
          <div className="metric-grid compact">
            {HEALTH_METRICS.filter((metric) => metric.id !== "sleepScore").map((metric) => <HealthMetricCard key={metric.id} data={data} metric={metric} />)}
          </div>
          {data.activities[0] && (
            <>
              <h3 className="health-subtitle">Laatste activiteit</h3>
              <ActivityList activities={data.activities.slice(0, 1)} />
            </>
          )}
        </>
      ) : resource.notConfigured ? (
        <p className="empty-state">Koppel je Garmin via een gratis intervals.icu-account om slaap, rusthartslag, HRV en stappen hier te zien.</p>
      ) : (
        <ResourceState loading={resource.loading} empty="Geen gezondheidsdata beschikbaar." />
      )}
    </Panel>
  );
}
