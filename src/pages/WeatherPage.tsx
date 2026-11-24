import { AppShell, type PageProps } from "../components/AppShell";
import { Panel, ResourceState } from "../components/Panel";
import { DayList, Dayparts, HourlyChart } from "../components/weather";
import { formatTemperature, weatherIcon, weatherLabel } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type { WeatherData } from "../types";

function uvLabel(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(value);
  if (rounded <= 2) return `${rounded} · laag`;
  if (rounded <= 5) return `${rounded} · matig`;
  if (rounded <= 7) return `${rounded} · hoog`;
  return `${rounded} · zeer hoog`;
}

export function WeatherPage(props: PageProps) {
  const weather = useLiveResource<WeatherData>("/api/weather", 15 * 60 * 1000, "/api/weather?refresh=1");
  const data = weather.data;
  const today = data?.observedAt?.slice(0, 10) ?? "";

  return (
    <AppShell {...props} title="Weer" intro={<p>{data ? `${data.location} · voorspelling van Open-Meteo` : "Voorspelling van Open-Meteo"}</p>}>
      {!data ? (
        <Panel title="Weer" icon="cloud" resource={weather}>
          <ResourceState loading={weather.loading} empty="Weergegevens zijn momenteel niet beschikbaar." />
        </Panel>
      ) : (
        <div className="page-grid">
          <Panel title="Nu" eyebrow={data.location} icon={weatherIcon(data.weatherCode, data.isDay)} className="span-5" resource={weather}>
            <div className="weather is-large">
              <p className="weather-temp">{Math.round(data.temperature)}°</p>
              <div>
                <p className="weather-label">{weatherLabel(data.weatherCode, data.isDay)}</p>
                <p className="weather-detail">Voelt als {Math.round(data.apparentTemperature)}°</p>
              </div>
            </div>
            <dl className="fact-grid">
              <div><dt>Vandaag min / max</dt><dd>{formatTemperature(data.today?.temperatureMin ?? null)} / {formatTemperature(data.today?.temperatureMax ?? null)}</dd></div>
              <div><dt>Wind</dt><dd>{Math.round(data.windSpeed)} km/u</dd></div>
              <div><dt>Luchtvochtigheid</dt><dd>{data.humidity}%</dd></div>
              <div><dt>UV-index</dt><dd>{uvLabel(data.today?.uvIndexMax ?? null)}</dd></div>
              <div><dt>Zonsopgang</dt><dd>{data.today?.sunrise?.slice(11, 16) ?? "—"}</dd></div>
              <div><dt>Zonsondergang</dt><dd>{data.today?.sunset?.slice(11, 16) ?? "—"}</dd></div>
            </dl>
            {data.dayparts && <Dayparts parts={data.dayparts} />}
          </Panel>

          <Panel title="Komende 48 uur" eyebrow="Per uur" icon="clock" className="span-7" resource={weather}>
            <HourlyChart hours={data.hours ?? []} />
          </Panel>

          <Panel title="Komende 7 dagen" icon="calendar" className="span-12" resource={weather}>
            {data.days?.length ? (
              <>
                <div className="day-list-head" aria-hidden="true">
                  <span>Dag</span><span>Weer</span><span>Regenkans</span><span>Neerslag</span><span>Wind max.</span><span>Max / min</span>
                </div>
                <DayList days={data.days} today={today} detailed />
              </>
            ) : (
              <p className="empty-state">Meerdaagse voorspelling niet beschikbaar.</p>
            )}
            <p className="panel-source">
              Bron: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>, een combinatie van weermodellen voor deze locatie. Officiële waarschuwingen: <a href="https://www.meteo.be/nl" target="_blank" rel="noopener noreferrer">KMI</a>.
            </p>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
