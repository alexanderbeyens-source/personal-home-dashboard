import { useState } from "react";
import { LOCALE, formatEuro, formatSigned } from "../format";
import { useElementWidth } from "../hooks/useElementWidth";
import { useLiveResource } from "../hooks/useLiveResource";
import type { ImieHistory, ImieRange } from "../types";
import { ResourceState } from "./Panel";

export const IMIE_RANGES: { id: ImieRange; label: string; title: string }[] = [
  { id: "1d", label: "1D", title: "1 dag" },
  { id: "5d", label: "5D", title: "5 dagen" },
  { id: "1m", label: "1M", title: "1 maand" },
  { id: "3m", label: "3M", title: "3 maanden" },
  { id: "6m", label: "6M", title: "6 maanden" },
  { id: "ytd", label: "YTD", title: "Sinds begin dit jaar" },
  { id: "1y", label: "1J", title: "1 jaar" },
  { id: "3y", label: "3J", title: "3 jaar" },
  { id: "5y", label: "5J", title: "5 jaar" },
  { id: "10y", label: "10J", title: "10 jaar" },
];

const STORAGE_KEY = "northstar.imie-range";

function storedRange(fallback: ImieRange): ImieRange {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return IMIE_RANGES.some((range) => range.id === value) ? (value as ImieRange) : fallback;
  } catch {
    return fallback;
  }
}

function formatPointTime(value: string, intraday: boolean) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat(LOCALE, intraday
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function axisLabel(value: string, range: ImieRange) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (range === "1d") return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }).format(date);
  if (["5d", "1m", "3m"].includes(range)) return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(date);
  if (["6m", "ytd", "1y"].includes(range)) return new Intl.DateTimeFormat(LOCALE, { month: "short" }).format(date);
  return new Intl.DateTimeFormat(LOCALE, { year: "numeric" }).format(date);
}

function niceTicks(min: number, max: number, count: number) {
  const span = max - min || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? rough;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step) ticks.push(value);
  return { ticks, step };
}

export function ImieChart({ defaultRange = "1m", compact = false }: { defaultRange?: ImieRange; compact?: boolean }) {
  const [range, setRange] = useState<ImieRange>(() => (compact ? defaultRange : storedRange(defaultRange)));
  const [active, setActive] = useState<number | null>(null);
  const [ref, width] = useElementWidth<HTMLDivElement>(compact ? 420 : 680);
  const resource = useLiveResource<ImieHistory>(
    `/api/economy/imie-history?range=${range}`,
    range === "1d" ? 60 * 1000 : 30 * 60 * 1000,
    `/api/economy/imie-history?range=${range}&refresh=1`,
  );
  const data = resource.data?.range === range ? resource.data : null;
  const select = (next: ImieRange) => {
    setRange(next);
    setActive(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Remembering the range is a convenience only.
    }
  };

  const height = compact ? 140 : width < 500 ? 220 : 280;
  const pad = { top: 14, right: 10, bottom: 28, left: compact ? 8 : 52 };
  const points = data?.points ?? [];
  const values = points.map((point) => point.v);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const margin = (max - min || max * 0.01) * 0.08;
  const lo = min - margin;
  const hi = max + margin;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (points.length > 1 ? (index / (points.length - 1)) * innerW : innerW / 2);
  const y = (value: number) => pad.top + (1 - (value - lo) / (hi - lo || 1)) * innerH;
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.v).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${pad.left},${pad.top + innerH} ${line} ${x(points.length - 1)},${pad.top + innerH}` : "";
  const { ticks, step } = niceTicks(lo, hi, compact ? 3 : 4);
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const labelCount = Math.max(2, Math.min(6, Math.floor(innerW / 90)));
  const labelIndexes = points.length > 1 ? Array.from({ length: labelCount }, (_, index) => Math.round((index / (labelCount - 1)) * (points.length - 1))) : [];
  const shown = active === null ? null : points[active];
  const intraday = data?.basis === "xetra-intraday";
  const change = data?.changePercent ?? null;
  const rangeTitle = IMIE_RANGES.find((item) => item.id === range)?.title ?? range;

  return (
    <div className={`imie-chart${compact ? " is-compact" : ""}`}>
      {!compact && (
        <div className="segmented range-tabs" role="group" aria-label="Periode">
          {IMIE_RANGES.map((item) => (
            <button key={item.id} type="button" className={`segment${range === item.id ? " is-active" : ""}`} aria-pressed={range === item.id} title={item.title} onClick={() => select(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="imie-chart-summary" aria-live="polite">
        {shown ? (
          <span><strong>{formatEuro(shown.v, 3)}</strong> · {formatPointTime(shown.t, intraday)}</span>
        ) : (
          <span>
            {change !== null ? <strong className={change < 0 ? "is-down" : undefined}>{formatSigned(change, 2)} %</strong> : <strong>—</strong>}{" "}
            {intraday && data?.previousClose ? "t.o.v. vorige slotkoers" : rangeTitle.toLowerCase()}
          </span>
        )}
        {data?.stale && <span className="tag tag-warning">Verouderd</span>}
      </div>
      <div ref={ref} className="imie-chart-canvas">
        {data && points.length > 1 ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            role="img"
            aria-label={`IMIE ${rangeTitle}: van ${formatEuro(points[0].v, 2)} naar ${formatEuro(points.at(-1)!.v, 2)}`}
            onPointerLeave={() => setActive(null)}
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const relative = ((event.clientX - box.left) / box.width) * width;
              const index = Math.round(((relative - pad.left) / innerW) * (points.length - 1));
              setActive(Math.min(points.length - 1, Math.max(0, index)));
            }}
          >
            <defs>
              <linearGradient id={`imie-fill-${compact ? "c" : "f"}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line className="imie-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
                {!compact && <text className="imie-axis" x={pad.left - 8} y={y(tick) + 4} textAnchor="end">€{tick.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</text>}
              </g>
            ))}
            {data.previousClose && intraday && (
              <line className="imie-baseline" x1={pad.left} x2={width - pad.right} y1={y(data.previousClose)} y2={y(data.previousClose)} />
            )}
            <polygon points={area} fill={`url(#imie-fill-${compact ? "c" : "f"})`} />
            <polyline className="imie-line" points={line} />
            {labelIndexes.map((index, position) => (
              <text
                key={`${index}-${position}`}
                className="imie-axis"
                x={x(index)}
                y={height - 8}
                textAnchor={position === 0 ? "start" : position === labelIndexes.length - 1 ? "end" : "middle"}
              >
                {axisLabel(points[index].t, range)}
              </text>
            ))}
            <circle className="imie-dot" cx={x(points.length - 1)} cy={y(points.at(-1)!.v)} r={4} />
            {shown && active !== null && (
              <g>
                <line className="imie-cursor" x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} />
                <circle className="imie-dot" cx={x(active)} cy={y(shown.v)} r={5} />
              </g>
            )}
          </svg>
        ) : data ? (
          <p className="empty-state">{data.note}</p>
        ) : (
          <ResourceState loading={resource.loading || resource.refreshing} empty={resource.error ? `Grafiek niet beschikbaar: ${resource.error}` : "Grafiek niet beschikbaar."} />
        )}
      </div>
      {data && !compact && (
        <p className="metric-note">
          {data.note}{" "}
          <a className="source-link" href={data.sourceUrl} target="_blank" rel="noopener noreferrer">{data.source}</a>
        </p>
      )}
      {data && compact && <p className="metric-note">{intraday ? "Xetra, vertraagd" : "Dagelijkse NAV in EUR"} · {rangeTitle}</p>}
    </div>
  );
}
