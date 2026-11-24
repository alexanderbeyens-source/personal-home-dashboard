import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { formatRelative } from "../format";
import type { LiveResource } from "../types";

type Tone = "neutral" | "busy" | "warning" | "error" | "muted";

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function resourceStatus(resource: LiveResource<unknown>, stale: boolean, now: number): { tone: Tone; chip: string; detail: string } {
  if (resource.loading && resource.data === null) return { tone: "busy", chip: "Laden…", detail: "Live gegevens laden…" };
  if (resource.refreshing) return { tone: "busy", chip: "Vernieuwen…", detail: "Vernieuwen…" };
  if (resource.notConfigured) return { tone: "muted", chip: "Niet geconfigureerd", detail: "Niet geconfigureerd op de server" };
  if (resource.error && resource.data === null) return { tone: "error", chip: "Fout", detail: `Laden mislukt: ${resource.error}` };
  if (resource.error) {
    return { tone: "warning", chip: "Vernieuwen mislukt", detail: `Vernieuwen mislukt: ${resource.error} · laatste geslaagde gegevens worden getoond` };
  }
  if (stale) return { tone: "warning", chip: "Verouderd", detail: "Sommige gegevens zijn verouderd; de laatste geslaagde versie wordt getoond" };
  return { tone: "neutral", chip: formatRelative(resource.updatedAt, now), detail: formatRelative(resource.updatedAt, now) };
}

export function Panel({
  title,
  eyebrow,
  icon,
  className = "",
  children,
  resource,
  stale = false,
  moreHref,
  moreLabel = "Alles bekijken",
  headerExtra,
  as: Tag = "section",
}: {
  title: string;
  eyebrow?: string;
  icon: IconName;
  className?: string;
  children: ReactNode;
  resource: LiveResource<unknown>;
  stale?: boolean;
  moreHref?: string;
  moreLabel?: string;
  headerExtra?: ReactNode;
  as?: "section" | "article";
}) {
  const now = useNow();
  const status = resourceStatus(resource, stale, now);
  const headingId = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <Tag className={`panel ${className}`} aria-labelledby={headingId}>
      <header className="panel-header">
        <div className="panel-title-group">
          <span className="panel-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
          <div>
            {eyebrow && <p className="panel-eyebrow">{eyebrow}</p>}
            <h2 id={headingId}>{title}</h2>
          </div>
        </div>
        <div className="panel-actions">
          <span className={`status-chip tone-${status.tone}`} title={status.detail}>
            {status.tone === "busy" ? <span className="loader" aria-hidden="true" /> : <span className="status-dot" aria-hidden="true" />}
            {status.chip}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label={`${title} vernieuwen`}
            title={`${title} vernieuwen`}
            disabled={resource.loading || resource.refreshing}
            onClick={() => void resource.refresh()}
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>
      </header>
      {headerExtra}
      <p className="visually-hidden" role="status" aria-live="polite">{status.detail}</p>
      {status.tone === "error" || status.tone === "warning" ? <p className={`panel-alert tone-${status.tone}`}>{status.detail}</p> : null}
      <div className="panel-body">{children}</div>
      {moreHref && (
        <footer className="panel-footer">
          <a className="more-link" href={moreHref}>{moreLabel} <Icon name="arrow" size={15} /></a>
        </footer>
      )}
    </Tag>
  );
}

export function ResourceState({ loading, empty }: { loading: boolean; empty: string }) {
  if (loading) {
    return (
      <div className="skeleton-stack" aria-label="Gegevens laden">
        <span className="skeleton" />
        <span className="skeleton short" />
        <span className="skeleton" />
      </div>
    );
  }
  return <p className="empty-state">{empty}</p>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {aside}
    </div>
  );
}
