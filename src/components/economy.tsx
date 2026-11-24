import { formatEconomicPeriod, formatEuro, formatNumber, formatPublishedDate, formatSigned, formatTime } from "../format";
import type { EconomicData, EconomicMetric, EconomicPolicyRate } from "../types";

const STALE_FAILED = "Vernieuwen mislukt; de vorige geslaagde observatie wordt getoond.";
const STALE_OLD = "De observatie is ouder dan de verwachte updatecyclus.";

export function StaleTag({ stale, observationStale }: { stale?: boolean; observationStale?: boolean }) {
  if (!stale && !observationStale) return null;
  return <span className="tag tag-warning" title={stale ? STALE_FAILED : STALE_OLD}>Verouderd</span>;
}

export function Sparkline({ history, label }: { history: { period: string; value: number }[]; label: string }) {
  if (history.length < 2) return null;
  const values = history.map(({ value }) => value);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${34 - ((value - min) / range) * 28}`).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 38" preserveAspectRatio="none" role="img" aria-label={`${label} – historisch verloop`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function metricDigits(metric: EconomicMetric) {
  return metric.unit === "EUR/kWh" ? 4 : metric.unit === "% j/j" ? 1 : 2;
}

function changeText(metric: EconomicMetric) {
  if (metric.change === null) return null;
  if (metric.unit === "% j/j" || metric.unit === "%") return `${formatSigned(metric.change, metric.unit === "%" ? 2 : 1)} pp t.o.v. vorige periode`;
  return `${formatSigned(metric.change, 4)} ${metric.unit} t.o.v. vorige periode`;
}

export function MetricCard({ title, metric, compact = false }: { title: string; metric: EconomicMetric | null; compact?: boolean }) {
  return (
    <article className="metric-card">
      <header className="metric-head">
        <h4>{title}</h4>
        <StaleTag stale={metric?.stale} observationStale={metric?.observationStale} />
      </header>
      {metric ? (
        <>
          <p className="metric-value">{formatNumber(metric.value, metricDigits(metric))}<small>{metric.unit}</small></p>
          <p className="metric-period">{formatEconomicPeriod(metric.period)} · {metric.frequency.split(" · ")[0]}</p>
          {!compact && <Sparkline history={metric.history} label={title} />}
          {changeText(metric) && <p className="metric-change">{changeText(metric)}</p>}
          {!compact && metric.sourceUpdatedAt && <p className="metric-note">Dataset bijgewerkt {formatPublishedDate(metric.sourceUpdatedAt)}</p>}
          {!compact && metric.disclaimer && <p className="metric-note">{metric.disclaimer}</p>}
          {!compact && metric.consumptionBand && <p className="metric-note">{metric.consumptionBand} · alle belastingen inbegrepen</p>}
          {!compact && <a className="source-link" href={metric.sourceUrl} target="_blank" rel="noopener noreferrer">{metric.source}</a>}
        </>
      ) : (
        <p className="empty-state">Momenteel niet beschikbaar</p>
      )}
    </article>
  );
}

export function PolicyRateCard({ rate, compact = false }: { rate: EconomicPolicyRate; compact?: boolean }) {
  return (
    <article className="metric-card">
      <header className="metric-head">
        <h4>{rate.label}</h4>
        <StaleTag stale={rate.stale} observationStale={rate.observationStale} />
      </header>
      <p className="metric-value">{formatNumber(rate.value, 2)}<small>%</small></p>
      <p className="metric-period">
        {rate.lastChangeDate ? `Laatst gewijzigd ${formatEconomicPeriod(rate.lastChangeDate)}` : "Geen wijziging in de historiek van 7 jaar"}
      </p>
      {!compact && <Sparkline history={rate.history} label={rate.label} />}
      {!compact && <p className="metric-note">Gegevens van {formatEconomicPeriod(rate.period)}</p>}
    </article>
  );
}

export function ImieCard({ data, large = false }: { data: EconomicData | null; large?: boolean }) {
  const quote = data?.imieQuote ?? null;
  const close = data?.imiePrice ?? null;
  return (
    <article className={`imie-card${large ? " is-large" : ""}`}>
      <header className="imie-head">
        <div>
          <p className="kicker">Wereldwijde aandelen</p>
          <h3>IMIE <span className="imie-name">SPDR MSCI ACWI IMI</span></h3>
        </div>
        <StaleTag stale={quote?.stale ?? close?.stale} observationStale={quote?.observationStale ?? close?.observationStale} />
      </header>
      {quote ? (
        <>
          <p className="imie-price">
            {formatEuro(quote.value, 2)}
            {quote.changePercent !== null && (
              <span className={`imie-change ${quote.changePercent > 0 ? "is-up" : quote.changePercent < 0 ? "is-down" : ""}`}>
                {formatSigned(quote.changePercent, 2)} %
              </span>
            )}
          </p>
          <p className="imie-meta">
            <span className="tag">{quote.tradingOpen ? "Beurs open" : "Beurs gesloten"}</span>
            {quote.venue} · {formatTime(quote.period)} · tot 15 min vertraagd
          </p>
          {large && (
            <dl className="imie-facts">
              {quote.previousClose !== null && <div><dt>Vorige slot</dt><dd>{formatEuro(quote.previousClose, 3)}</dd></div>}
              {quote.dayLow !== null && quote.dayHigh !== null && <div><dt>Dagbereik</dt><dd>{formatEuro(quote.dayLow, 3)} – {formatEuro(quote.dayHigh, 3)}</dd></div>}
              {close && <div><dt>Officiële slotkoers uitgever</dt><dd>{formatEuro(close.value, 2)} · {formatEconomicPeriod(close.period)}</dd></div>}
              <div><dt>ISIN · Xetra-ticker</dt><dd>{quote.isin} · {quote.ticker}</dd></div>
            </dl>
          )}
          <a className="source-link" href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">{quote.source}</a>
        </>
      ) : close ? (
        <>
          <p className="imie-price">{formatEuro(close.value, 2)}</p>
          <p className="imie-meta">Officiële slotkoers · {formatEconomicPeriod(close.period)} · intraday-koers niet beschikbaar</p>
          <a className="source-link" href={close.sourceUrl} target="_blank" rel="noopener noreferrer">{close.source}</a>
        </>
      ) : (
        <p className="empty-state">Koers momenteel niet beschikbaar.</p>
      )}
      {large && <p className="metric-note">Een ETF-koers, geen indexniveau en geen persoonlijk rendement. Gratis bronnen lopen tot 15 minuten achter.</p>}
    </article>
  );
}
