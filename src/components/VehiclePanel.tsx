import { useState } from "react";
import { LOCALE, formatNumber } from "../format";
import { useLiveResource } from "../hooks/useLiveResource";
import type { VehicleData } from "../types";
import { Panel, ResourceState } from "./Panel";

export const VEHICLE_URL = "/api/vehicle";
export const SMARTCAR_CONNECT_URL = "/api/smartcar/connect";

// Messages after returning from Smartcar Connect (/api/smartcar/callback redirects to /?auto=…).
const CONNECT_RESULTS: Record<string, string> = {
  gekoppeld: "Je auto is gekoppeld. De gegevens worden opgehaald.",
  geannuleerd: "Koppelen is geannuleerd.",
  ongeldig: "Koppelen is niet gelukt: de aanvraag was verlopen of ongeldig. Probeer het opnieuw.",
  config: "De Smartcar-koppeling is niet correct ingesteld op de server.",
};

const UNAVAILABLE_REASONS: Record<string, string> = {
  "vehicle-offline": "de auto slaapt of heeft geen bereik",
  "rate-limited": "te veel verzoeken bij Smartcar",
  "plan-limit": "de maandlimiet van het Smartcar-plan is bereikt",
  "no-signals": "de auto gaf geen waarden door",
};

function takeConnectResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("auto");
  if (!result) return null;
  params.delete("auto");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  return CONNECT_RESULTS[result] ?? null;
}

function dateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function chargeText(data: VehicleData) {
  if (data.isCharging === true) return "Aan het laden";
  if (data.isCharging === false) return data.cableConnected ? "Kabel aangesloten, laadt niet" : "Laadt niet";
  if (data.cableConnected === true) return "Kabel aangesloten";
  return null;
}

function ConnectedVehicle({ data }: { data: VehicleData }) {
  const percent = data.batteryPercent ?? null;
  const charge = chargeText(data);
  const reported = dateTime(data.reportedAt);
  const fetched = dateTime(data.updatedAt);
  return (
    <>
      {data.stale && (
        <p className="inline-warning" role="status">
          Data tijdelijk niet beschikbaar
          {data.unavailableReason && UNAVAILABLE_REASONS[data.unavailableReason] ? ` (${UNAVAILABLE_REASONS[data.unavailableReason]})` : ""}
          {fetched ? ` · laatste geldige waarde van ${fetched}` : ""}
        </p>
      )}
      <div className="vehicle-battery">
        <p className="metric-value">
          {percent !== null ? <>{formatNumber(percent, 0)}<small>%</small></> : <span className="empty-state">Batterij niet beschikbaar</span>}
        </p>
        {percent !== null && (
          <div className="vehicle-bar" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <div className="metric-grid compact">
        <article className="metric-card">
          <header className="metric-head"><h4>Actieradius</h4></header>
          {data.rangeKm !== null && data.rangeKm !== undefined
            ? <p className="metric-value">{formatNumber(data.rangeKm, 0)}<small>km</small></p>
            : <p className="empty-state">Niet beschikbaar</p>}
        </article>
        <article className="metric-card">
          <header className="metric-head"><h4>Laden</h4></header>
          {charge ? <p className={`vehicle-charge${data.isCharging ? " is-charging" : ""}`}>{charge}</p> : <p className="empty-state">Niet beschikbaar</p>}
        </article>
      </div>
      <p className="vehicle-meta">
        {reported ? <>Gemeld door de auto: {reported}</> : "Meldtijd van de auto onbekend"}
        {fetched && <><br />Opgehaald via Smartcar: {fetched}</>}
      </p>
    </>
  );
}

export function VehiclePanel() {
  const resource = useLiveResource<VehicleData>(VEHICLE_URL, 60 * 60 * 1000, `${VEHICLE_URL}?refresh=1`);
  const [connectResult] = useState(takeConnectResult);
  const data = resource.data;
  // Hidden until the Smartcar settings exist on the server, like the other optional integrations.
  if (resource.notConfigured && !connectResult) return null;
  const vehicleName = data?.vehicle?.model ? `${data.vehicle.make ? "Mercedes-Benz " : ""}${data.vehicle.model}` : "Mercedes-Benz via Smartcar";
  return (
    <Panel title="Auto" eyebrow={vehicleName} icon="car" className="vehicle-panel" resource={resource} stale={data?.stale}>
      {connectResult && <p className="vehicle-notice" role="status">{connectResult}</p>}
      {data?.state === "connected" ? (
        <ConnectedVehicle data={data} />
      ) : data?.state === "not_connected" ? (
        <>
          <p className="empty-state">Je auto is nog niet gekoppeld. Koppel hem één keer via Smartcar met je Mercedes me-account (alleen lezen).</p>
          <a className="button-primary vehicle-action" href={SMARTCAR_CONNECT_URL}>Auto koppelen</a>
        </>
      ) : data?.state === "reauth_required" ? (
        <>
          <p className="empty-state">Opnieuw autoriseren nodig: Smartcar heeft opnieuw toestemming nodig om je auto te lezen.</p>
          <a className="button-primary vehicle-action" href={SMARTCAR_CONNECT_URL}>Opnieuw autoriseren</a>
        </>
      ) : resource.notConfigured ? (
        <p className="empty-state">Stel de Smartcar-koppeling in op de server om je auto hier te zien.</p>
      ) : (
        <ResourceState loading={resource.loading} empty="Gegevens van de auto zijn tijdelijk niet beschikbaar." />
      )}
    </Panel>
  );
}
