import type { ReactNode } from "react";
import { Icon } from "./Icon";

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
}: {
  title: string;
  eyebrow: string;
  icon: IconKey;
  className?: string;
  children: ReactNode;
}) {
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
        <span className="panel-mark" aria-hidden="true">↗</span>
      </div>
      {children}
    </section>
  );
}

export function ResourceState({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error: string | null;
  empty: string;
}) {
  if (loading) {
    return <div className="state-message"><span className="loader" />Fetching live data…</div>;
  }
  if (error) {
    return (
      <div className="state-message state-error">
        <span className="state-dot" />
        <span>{error}</span>
      </div>
    );
  }
  return <div className="state-message">{empty}</div>;
}
