interface MobilityHomePageProps {
  user: { name?: string | null };
  csrfToken: string;
  signOutError: string | null;
  onSignOut: (csrfToken: string) => void;
}

const unavailable = "Not available";

function DataRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="mobility-data-list">
      {rows.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MobilityHomePage({
  user,
  csrfToken,
  signOutError,
  onSignOut,
}: MobilityHomePageProps) {
  return (
    <main className="app-shell mobility-shell">
      <header className="topbar mobility-topbar">
        <a className="brand" href="/" aria-label="Northstar home">
          <span className="brand-mark"><span /></span>
          <span className="brand-copy"><strong>northstar</strong><small>PERSONAL COMMAND CENTER</small></span>
        </a>
        <div className="topbar-right">
          <a className="news-home-link" href="/">Dashboard</a>
          <a className="news-home-link" href="/news">News</a>
          <span className="account-name">{user.name || "Signed in"}</span>
          <button className="sign-out-button" onClick={() => onSignOut(csrfToken)}>Sign out</button>
        </div>
      </header>
      {signOutError && <p className="auth-inline-error">{signOutError}</p>}

      <section className="mobility-intro">
        <p className="eyebrow">NORTHSTAR · DEVICE CONNECTIONS</p>
        <h1>Mobility &amp; Home<span>.</span></h1>
        <p>Integration availability for your Mercedes-Benz CLA 250+ and Dreame L50s Pro Ultra.</p>
      </section>

      <p className="mobility-notice" role="status">
        This page reports integration availability only. Northstar is not connected to either device and has not
        requested device data. No device status or update time is being simulated.
      </p>

      <section className="mobility-card-grid" aria-label="Device integration assessments">
        <article className="mobility-card">
          <div className="mobility-card-heading">
            <div>
              <p className="eyebrow">ELECTRIC VEHICLE</p>
              <h2>Mercedes-Benz CLA 250+</h2>
              <p className="mobility-model-note">Model year 2026 · Europe</p>
            </div>
            <span className="mobility-status">Access unverified</span>
          </div>
          <p className="mobility-card-copy">
            Mercedes-Benz developer APIs exist for connected-vehicle data, but Northstar cannot verify private
            self-service access, the required European vehicle consent, or compatibility with this model year.
            Community routes that use private Mercedes me endpoints are not used.
          </p>
          <DataRows rows={[
            { label: "Battery, charging & range", value: unavailable },
            { label: "Odometer", value: unavailable },
            { label: "Charge power & remaining time", value: unavailable },
            { label: "Last successful Northstar update", value: "Never — no connection configured" },
          ]} />
          <p className="mobility-card-footnote">
            No vehicle data is requested. No credentials or environment variables are needed or configured.
          </p>
          <a className="mobility-source-link" href="https://developer.mercedes-benz.com/" target="_blank" rel="noopener noreferrer">
            Mercedes-Benz developer portal
          </a>
        </article>

        <article className="mobility-card">
          <div className="mobility-card-heading">
            <div>
              <p className="eyebrow">ROBOT VACUUM</p>
              <h2>Dreame L50s Pro Ultra</h2>
              <p className="mobility-model-note">Exact model appears in community support list</p>
            </div>
            <span className="mobility-status">Requires Home Assistant</span>
          </div>
          <p className="mobility-card-copy">
            A maintained community integration lists this model, but requires Home Assistant and Dreamehome account
            credentials for its cloud connection. Northstar will not install Home Assistant or reimplement its
            undocumented cloud protocol. Matter support for this model and firmware is unverified.
          </p>
          <DataRows rows={[
            { label: "Robot status & battery", value: unavailable },
            { label: "Last clean, duration & area", value: unavailable },
            { label: "Maintenance & errors", value: unavailable },
            { label: "Last successful Northstar update", value: "Never — no connection configured" },
          ]} />
          <p className="mobility-card-footnote">
            No Dreame credentials are requested or stored. The community integration may expose different data
            depending on the exact hardware variant.
          </p>
          <a className="mobility-source-link" href="https://dv.tasshack.com/guide/more/supported-devices" target="_blank" rel="noopener noreferrer">
            Dreame community supported devices
          </a>
        </article>
      </section>

      <footer className="page-footer">
        <span>Read-only assessment · no device commands or external account calls</span>
        <a className="news-home-link" href="/">Back to dashboard</a>
      </footer>
    </main>
  );
}
