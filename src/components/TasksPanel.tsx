import { useLiveResource } from "../hooks/useLiveResource";
import type { TasksData } from "../types";
import { Panel, ResourceState } from "./Panel";
import { TaskAddForm, TaskGroup, dashboardOnceItems, useTaskToggle } from "./tasks";

export const TASKS_URL = "/api/tasks";

export function TasksPanel({ csrfToken }: { csrfToken: string }) {
  const resource = useLiveResource<TasksData>(TASKS_URL, 5 * 60 * 1000, `${TASKS_URL}?refresh=1`);
  const { data, toggle, pending, error, replace } = useTaskToggle(resource, csrfToken);
  const once = data?.sections.find((section) => section.id === "once");
  const deadlines = data ? dashboardOnceItems(once, data.today) : [];
  return (
    <Panel
      title="Taken"
      eyebrow={data ? `${data.open} open${data.overdue ? ` · ${data.overdue} verlopen` : ""}` : "Takenlijst"}
      icon="check"
      className="tasks-panel"
      resource={resource}
      stale={data?.stale}
      moreHref={data ? "/taken" : undefined}
      moreLabel="Alle taken"
    >
      {error && <p className="task-error" role="alert">{error}</p>}
      {data && data.total > 0 ? (
        <div className="task-groups">
          {data.sections.filter((section) => section.id !== "once" && section.items.length).map((section) => (
            <TaskGroup key={section.id} section={section} today={data.today} pending={pending} onToggle={toggle} />
          ))}
          {once && deadlines.length > 0 && (
            <TaskGroup section={once} items={deadlines} title="Deadlines" today={data.today} pending={pending} onToggle={toggle} />
          )}
        </div>
      ) : resource.notConfigured ? (
        <p className="empty-state">Koppel een takenbestand uit een privé GitHub-repository om je taken hier te zien en af te vinken.</p>
      ) : (
        <ResourceState loading={resource.loading} empty="Het takenbestand bevat nog geen taken." />
      )}
      {data && <TaskAddForm csrfToken={csrfToken} onAdded={replace} compact />}
    </Panel>
  );
}
