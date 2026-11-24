import { AppShell, type PageProps } from "../components/AppShell";
import { HEALTH_URL } from "../components/HealthPanel";
import { ActivityList, HEALTH_METRICS, HealthMetricCard } from "../components/health";
import { Panel, ResourceState } from "../components/Panel";
import { useLiveResource } from "../hooks/useLiveResource";
import type { HealthData } from "../types";

export function HealthPage(props: PageProps) {
  const resource = useLiveResource<HealthData>(HEALTH_URL, 30 * 60 * 1000, `${HEALTH_URL}?refresh=1`);
  const data = resource.data;
  return (
    <AppShell {...props} title="Gezondheid" intro={<p>Slaap, hartslag en activiteit van je Garmin, via intervals.icu. Ontbrekende waarden worden niet als nul getoond.</p>}>
      {data?.warnings.length ? (
        <div className="notice-list" role="status">
          {data.warnings.map((warning) => <p key={warning.source}><strong>{warning.source}:</strong> {warning.message}</p>)}
        </div>
      ) : null}
      <div className="page-grid">
        <Panel title="Laatste 14 dagen" icon="heart" className="span-12" resource={resource} stale={data?.stale}>
          {data ? (
            <>
              <div className="metric-grid">
                {HEALTH_METRICS.map((metric) => <HealthMetricCard key={metric.id} data={data} metric={metric} days={14} />)}
              </div>
              <a className="source-link" href={data.sourceUrl} target="_blank" rel="noopener noreferrer">{data.source}</a>
            </>
          ) : resource.notConfigured ? (
            <p className="empty-state">Er is nog geen gezondheidsbron gekoppeld. Zie de README voor de stappen met intervals.icu.</p>
          ) : (
            <ResourceState loading={resource.loading} empty="Geen gezondheidsdata beschikbaar." />
          )}
        </Panel>
        {data && (
          <Panel title="Activiteiten" eyebrow="Laatste 30 dagen" icon="trend" className="span-12" resource={resource}>
            {data.activities.length ? <ActivityList activities={data.activities} /> : <p className="empty-state">Geen activiteiten in de laatste 30 dagen.</p>}
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
