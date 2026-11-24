import { AppShell, type PageProps } from "../components/AppShell";
import { AgendaDays, CalendarLegend, groupAgenda } from "../components/agenda";
import { Panel, ResourceState } from "../components/Panel";
import { useLiveResource } from "../hooks/useLiveResource";
import type { CalendarData } from "../types";

export function AgendaPage(props: PageProps) {
  const agenda = useLiveResource<CalendarData>("/api/calendar", 5 * 60 * 1000, "/api/calendar?refresh=1");
  const days = agenda.data ? groupAgenda(agenda.data.events) : [];
  return (
    <AppShell {...props} title="Agenda" intro={<p>Je afspraken voor de komende twee weken, uit al je gekoppelde agenda's.</p>}>
      {agenda.data?.warnings?.length ? (
        <div className="notice-list" role="status">
          {agenda.data.warnings.map((warning) => <p key={`${warning.source}-${warning.message}`}><strong>{warning.source}:</strong> {warning.message}</p>)}
        </div>
      ) : null}
      <div className="page-grid">
        <Panel title="Komende 14 dagen" icon="calendar" className="span-12" resource={agenda}>
          {agenda.data && <CalendarLegend data={agenda.data} />}
          {days.length ? (
            <AgendaDays days={days} />
          ) : agenda.notConfigured ? (
            <p className="empty-state">Er is nog geen agenda gekoppeld. Zet in iCloud per agenda "Openbare agenda" aan en voeg de links toe aan de serveromgeving.</p>
          ) : (
            <ResourceState loading={agenda.loading} empty="Geen afspraken in de komende twee weken." />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
