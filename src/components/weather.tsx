import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { formatTemperature, localDateLabel, weatherIcon, weatherLabel } from "../format";
import type { WeatherDay, WeatherDaypart, WeatherHour } from "../types";

export function Dayparts({ parts }: { parts: WeatherDaypart[] }) {
  return (
    <ul className="dayparts" aria-label="Vandaag per dagdeel">
      {parts.map((part) => (
        <li key={part.id} className={`daypart is-${part.status}`}>
          <span className="daypart-label">{part.label}</span>
          <Icon name={weatherIcon(part.weatherCode, part.id !== "evening")} size={22} />
          <strong className="daypart-temp">{formatTemperature(part.averageTemperature)}</strong>
          <span className="daypart-meta" title={part.weatherCode === null ? undefined : weatherLabel(part.weatherCode)}>
            {part.precipitationProbabilityMax === null ? "—" : `${part.precipitationProbabilityMax}% regen`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DayList({ days, today, detailed = false }: { days: WeatherDay[]; today: string; detailed?: boolean }) {
  return (
    <ul className={`day-list${detailed ? " is-detailed" : ""}`}>
      {days.map((day) => (
        <li key={day.date} className="day-row">
          <span className="day-name">{localDateLabel(day.date, today)}</span>
          <span className="day-condition" title={weatherLabel(day.weatherCode)}>
            <Icon name={weatherIcon(day.weatherCode)} size={20} />
            <span>{weatherLabel(day.weatherCode)}</span>
          </span>
          <span className="day-rain" title="Maximale regenkans"><Icon name="drop" size={13} /> {day.precipitationProbabilityMax === null ? "—" : `${day.precipitationProbabilityMax}%`}</span>
          {detailed && <span className="day-extra">{day.precipitationSum === null ? "—" : `${day.precipitationSum.toLocaleString("nl-BE")} mm`}</span>}
          {detailed && <span className="day-extra">{day.windSpeedMax === null ? "—" : `${Math.round(day.windSpeedMax)} km/u`}</span>}
          <span className="day-temps"><strong>{formatTemperature(day.temperatureMax)}</strong> <span>{formatTemperature(day.temperatureMin)}</span></span>
        </li>
      ))}
    </ul>
  );
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(280, Math.round(element.clientWidth)) || fallback);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

export function HourlyChart({ hours }: { hours: WeatherHour[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLElement>(720);
  const CHART = { width, height: width < 500 ? 200 : 220, top: 18, bottom: 34, left: 34, right: 12 };
  const labelEvery = width < 500 ? 12 : 6;
  const temps = hours.map((hour) => hour.temperature).filter((value): value is number => value !== null);
  if (hours.length < 2 || temps.length < 2) return <p className="empty-state">Uurlijkse voorspelling niet beschikbaar.</p>;
  const min = Math.floor(Math.min(...temps) - 1);
  const max = Math.ceil(Math.max(...temps) + 1);
  const innerW = CHART.width - CHART.left - CHART.right;
  const innerH = CHART.height - CHART.top - CHART.bottom;
  const x = (index: number) => CHART.left + (index / (hours.length - 1)) * innerW;
  const y = (value: number) => CHART.top + (1 - (value - min) / (max - min || 1)) * innerH;
  const line = hours.map((hour, index) => (hour.temperature === null ? null : `${x(index)},${y(hour.temperature)}`)).filter(Boolean).join(" ");
  const step = max - min > 12 ? 4 : 2;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) ticks.push(value);
  const barW = Math.max(2, innerW / hours.length - 3);
  const shown = active === null ? null : hours[active];

  return (
    <figure className="hourly-chart" ref={ref}>
      <div className="hourly-readout" aria-live="polite">
        {shown ? (
          <>
            <strong>{shown.time.slice(11, 16)}</strong> · {localDateLabel(shown.time.slice(0, 10), hours[0].time.slice(0, 10))} ·{" "}
            {formatTemperature(shown.temperature)} · {weatherLabel(shown.weatherCode, shown.isDay ?? true)} ·{" "}
            {shown.precipitationProbability ?? "—"}% regenkans
          </>
        ) : (
          <span>Beweeg of tik op de grafiek voor details per uur.</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={`Temperatuur en regenkans voor de komende ${hours.length} uur, van ${Math.round(Math.min(...temps))}° tot ${Math.round(Math.max(...temps))}°`}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const relative = ((event.clientX - box.left) / box.width) * CHART.width;
          const index = Math.round(((relative - CHART.left) / innerW) * (hours.length - 1));
          setActive(Math.min(hours.length - 1, Math.max(0, index)));
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={CHART.left} x2={CHART.width - CHART.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart-axis" x={CHART.left - 6} y={y(tick) + 4} textAnchor="end">{tick}°</text>
          </g>
        ))}
        {hours.map((hour, index) => hour.precipitationProbability ? (
          <rect
            key={`rain-${hour.time}`}
            className="chart-rain"
            x={x(index) - barW / 2}
            width={barW}
            y={CHART.top + innerH - (hour.precipitationProbability / 100) * innerH * 0.45}
            height={(hour.precipitationProbability / 100) * innerH * 0.45}
          />
        ) : null)}
        {hours.map((hour, index) => (hour.time.endsWith("T00:00") && index > 0 ? (
          <line key={`day-${hour.time}`} className="chart-day" x1={x(index)} x2={x(index)} y1={CHART.top} y2={CHART.top + innerH} />
        ) : null))}
        <polyline className="chart-line" points={line} />
        {hours.map((hour, index) => (index % labelEvery === 0 ? (
          <text key={`t-${hour.time}`} className="chart-axis" x={x(index)} y={CHART.height - 12} textAnchor="middle">{hour.time.slice(11, 13)}u</text>
        ) : null))}
        {shown && shown.temperature !== null && active !== null && (
          <g>
            <line className="chart-cursor" x1={x(active)} x2={x(active)} y1={CHART.top} y2={CHART.top + innerH} />
            <circle className="chart-dot" cx={x(active)} cy={y(shown.temperature)} r={5} />
          </g>
        )}
      </svg>
      <figcaption className="chart-legend">
        <span><i className="legend-line" aria-hidden="true" /> Temperatuur</span>
        <span><i className="legend-bar" aria-hidden="true" /> Regenkans</span>
        <span>Stippellijn = middernacht</span>
      </figcaption>
    </figure>
  );
}
