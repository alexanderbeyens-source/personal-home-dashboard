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
    ? "Live gegevens laden…"
    : resource.refreshing
      ? `Vernieuwen · laatste geslaagde update ${formatUpdateTime(resource.updatedAt)}`
      : resource.notConfigured
        ? "Niet geconfigureerd op de server"
      : resource.error
        ? resource.data === null
          ? `Laden mislukt: ${resource.error}`
          : `Vernieuwen mislukt: ${resource.error} · laatste geslaagde update ${formatUpdateTime(resource.updatedAt)}`
        : resource.updatedAt
          ? `Bijgewerkt ${formatUpdateTime(resource.updatedAt)}`
          : "Nog geen geslaagde update";

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
          aria-label={`${title} vernieuwen`}
          title={`${title} vernieuwen`}
          disabled={resource.loading || resource.refreshing}
          onClick={() => void resource.refresh()}
        >
          {resource.refreshing ? <span className="loader" /> : <Icon name="refresh" size={15} />}
        </button>
      </div>
      <p className={`panel-resource-status${resource.error && !resource.notConfigured ? " has-error" : ""}`} role="status" aria-live="polite">
        {status}
      </p>
      {children}
    </section>
  );
}

function formatUpdateTime(date: Date | null) {
  if (!date) return "niet beschikbaar";
  return new Intl.DateTimeFormat("nl-BE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ResourceState({ loading, empty }: { loading: boolean; empty: string }) {
  if (loading) {
    return <div className="state-message"><span className="loader" />Live gegevens ophalen…</div>;
  }
  return <div className="state-message">{empty}</div>;
}
