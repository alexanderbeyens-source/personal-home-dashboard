import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { LiveResource } from "../types";

type IconKey =
  | "sun"
  | "cloud"
  | "calendar"
  | "news"
  | "ball"
  | "chart"
  | "home"
  | "grid";

export function Panel({
  title,
  eyebrow,
  icon,
  className = "",
  children,
  resource,
}: {
  title: string;
  eyebrow: string;
  icon: IconKey;
  className?: string;
  children: ReactNode;
  resource: LiveResource<unknown>;
}) {
  const status = resource.loading && resource.data === null
    ? "Loading live data…"
    : resource.refreshing
      ? `Refreshing · last successful update ${formatUpdateTime(resource.updatedAt)}`
      : resource.error
        ? resource.data === null
          ? `Unable to load: ${resource.error}`
          : `Refresh failed: ${resource.error} · last successful update ${formatUpdateTime(resource.updatedAt)}`
        : resource.updatedAt
          ? `Last updated ${formatUpdateTime(resource.updatedAt)}`
          : "No successful update yet";

  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div className="panel-heading-main">
          <span className="panel-icon"><Icon name={icon} size={17} /></span>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
        </div>
        <button
          className="panel-refresh"
          type="button"
          aria-label={`Refresh ${title}`}
          title={`Refresh ${title}`}
          disabled={resource.loading || resource.refreshing}
          onClick={() => void resource.refresh()}
        >
          {resource.refreshing ? <span className="loader" /> : <Icon name="refresh" size={15} />}
        </button>
      </div>
      <p className={`panel-resource-status${resource.error ? " has-error" : ""}`} role="status" aria-live="polite">
        {status}
      </p>
      {children}
    </section>
  );
}

function formatUpdateTime(date: Date | null) {
  if (!date) return "not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ResourceState({ loading, empty }: { loading: boolean; empty: string }) {
  if (loading) {
    return <div className="state-message"><span className="loader" />Fetching live data…</div>;
  }
  return <div className="state-message">{empty}</div>;
}
