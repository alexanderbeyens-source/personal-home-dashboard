import { AppShell, type PageProps } from "../components/AppShell";
import { Panel, ResourceState } from "../components/Panel";
import { TASKS_URL } from "../components/TasksPanel";
import { TaskGroup, useTaskToggle } from "../components/tasks";
import { useLiveResource } from "../hooks/useLiveResource";
import type { TasksData } from "../types";

export function TasksPage(props: PageProps) {
  const resource = useLiveResource<TasksData>(TASKS_URL, 5 * 60 * 1000, `${TASKS_URL}?refresh=1`);
  const { data, toggle, pending, error } = useTaskToggle(resource, props.csrfToken);
  return (
    <AppShell {...props} title="Taken" intro={<p>Afvinken gebeurt meteen in je takenbestand op GitHub. Taken toevoegen of wijzigen doe je in dat bestand, of door het aan Claude te vragen.</p>}>
      {error && <div className="notice-list" role="alert"><p>{error}</p></div>}
      <div className="page-grid">
        {data && data.total > 0 ? (
          data.sections.map((section) => (
            <Panel key={section.id} title={section.title} icon="check" className="span-6" resource={resource} stale={data.stale}>
              <TaskGroup section={section} today={data.today} pending={pending} onToggle={toggle} />
            </Panel>
          ))
        ) : (
          <Panel title="Taken" icon="check" className="span-12" resource={resource}>
            {resource.notConfigured ? (
              <p className="empty-state">Er is nog geen takenbestand gekoppeld. Zie de README voor de stappen.</p>
            ) : (
              <ResourceState loading={resource.loading} empty="Het takenbestand bevat nog geen taken." />
            )}
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
