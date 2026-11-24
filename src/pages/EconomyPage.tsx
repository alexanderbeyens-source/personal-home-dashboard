import { AppShell, type PageProps } from "../components/AppShell";
import { ImieCard, MetricCard, PolicyRateCard } from "../components/economy";
import { ImieChart } from "../components/ImieChart";
import { Panel, ResourceState } from "../components/Panel";
import { formatEconomicPeriod, formatNumber } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type { EconomicData, FinanceData } from "../types";

export function EconomyPage(props: PageProps) {
  const economics = useLiveResource<EconomicData>("/api/economy", 2 * 60 * 1000, "/api/economy?refresh=1");
  const finance = useLiveResource<FinanceData>("/api/finance", 60 * 60 * 1000, "/api/finance?refresh=1");
  const data = economics.data;

  return (
    <AppShell {...props} title="Economie" intro={<p>Officiële indicatoren voor België, de eurozone en de wereld. Informatief; geen beleggings- of kredietadvies.</p>}>
      {data?.warnings.length ? (
        <div className="notice-list" role="status">
          {data.warnings.map((warning) => (
            <p key={`${warning.source}-${warning.message}`}><strong>{warning.source}:</strong> {warning.message}{warning.stale ? " De laatste geslaagde observatie wordt getoond." : ""}</p>
          ))}
        </div>
      ) : null}
      <div className="page-grid">
        <Panel title="Wereldwijde aandelen" eyebrow="IMIE · koers en verloop" icon="trend" className="span-12" resource={economics}>
          <div className="imie-layout">
            {data || !economics.loading ? <ImieCard data={data} large /> : <ResourceState loading empty="" />}
            <ImieChart />
          </div>
        </Panel>

        <Panel title="ECB-beleidsrentes" eyebrow="Europese Centrale Bank" icon="chart" className="span-12" resource={economics}>
          {data?.policyRates?.rates.length ? (
            <div className="metric-grid">
              {data.policyRates.rates.map((rate) => <PolicyRateCard key={rate.id} rate={rate} />)}
            </div>
          ) : (
            <ResourceState loading={economics.loading} empty="Beleidsrentes zijn momenteel niet beschikbaar." />
          )}
          <a className="source-link" href={data?.policyRates?.sourceUrl ?? "https://data.ecb.europa.eu/data/datasets/FM"} target="_blank" rel="noopener noreferrer">ECB-bron</a>
        </Panel>

        <Panel title="Wereld, inflatie & wonen" icon="chart" className="span-12" resource={economics}>
          <div className="metric-grid four">
            <MetricCard title="Mondiale reële bbp-groei" metric={data?.worldGrowth ?? null} />
            <MetricCard title="België · HICP" metric={data?.belgiumInflation ?? null} />
            <MetricCard title="Eurozone · HICP" metric={data?.euroAreaInflation ?? null} />
            <MetricCard title="Nieuwe Belgische hypotheken" metric={data?.mortgageRates ?? null} />
          </div>
        </Panel>

        <Panel title="Energie voor Belgische gezinnen" icon="chart" className="span-7" resource={economics}>
          <div className="metric-grid">
            <MetricCard title="Elektriciteit" metric={data?.electricityPrices ?? null} />
            <MetricCard title="Aardgas" metric={data?.gasPrices ?? null} />
          </div>
          <p className="panel-source">Eurostat-consumentenprijzen voor representatieve verbruiksklassen van gezinnen, inclusief belastingen en heffingen. Geen groothandelsprijzen.</p>
        </Panel>

        <Panel title="Dagelijkse referentiekoersen" eyebrow="Frankfurter · ECB" icon="chart" className="span-5" resource={finance}>
          {finance.data ? (
            <>
              <ul className="rate-list">
                {Object.entries(finance.data.rates).map(([currency, value]) => (
                  <li key={currency}><span>EUR/{currency}</span><strong>{formatNumber(value, 4)}</strong></li>
                ))}
              </ul>
              <p className="panel-source">1 EUR · {formatEconomicPeriod(finance.data.date)} · referentiekoersen, geen persoonlijke rekeningsaldi</p>
            </>
          ) : (
            <ResourceState loading={finance.loading} empty="Referentiekoersen zijn momenteel niet beschikbaar." />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
