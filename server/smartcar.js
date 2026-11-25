// Read-only vehicle data (Mercedes-Benz via Smartcar, official Mercedes-Benz partner) on the
// Smartcar Vehicles API v3. v3 uses application-level tokens (client credentials, valid one
// hour, no refresh token), so nothing has to survive a Render restart: the token is simply
// requested again, and the vehicle connection itself is stored by Smartcar and looked up via
// GET /v3/connections. Only signals are read; no commands are ever sent.
//
// The client secret and access tokens stay inside this module and the request function in
// index.js. They are never returned, logged or put into error messages.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SMARTCAR_TOKEN_URL = "https://iam.smartcar.com/oauth2/token";
export const SMARTCAR_API = "https://vehicle.api.smartcar.com/v3";
export const SMARTCAR_CONNECT_URL = "https://connect.smartcar.com/oauth/authorize";
export const SMARTCAR_CALLBACK_PATH = "/api/smartcar/callback";

// The only signals Northstar reads. Location and commands are deliberately not requested.
export const SIGNALS = {
  stateOfCharge: "tractionbattery-stateofcharge",
  range: "tractionbattery-range",
  isCharging: "charge-ischarging",
  cableConnected: "charge-ischargingcableconnected",
};

// Read-only permissions Connect asks for, so the four signals do not depend on the dashboard's
// Vehicle Access selection (a Connect `scope` overrides it). No location, no commands.
export const CONNECT_SCOPE = ["read_battery", "read_charge"];

const STATE_MAX_AGE_MS = 15 * 60 * 1000;
// Errors that only a new Smartcar Connect flow fixes. VEHICLE_MISSING and NO_VEHICLES are not
// among them (Smartcar documents no re-authentication for those): they mean "no vehicle".
const NOT_CONNECTED_CODES = new Set(["VEHICLE_MISSING", "NO_VEHICLES"]);

function configError(message, reason) {
  const error = new Error(message);
  error.status = 500;
  error.kind = "config";
  error.code = "invalid_config";
  error.reason = reason;
  return error;
}

function smartcarError(message, { status, kind, reason, retryAfterMs } = {}) {
  const error = new Error(message);
  error.kind = kind ?? (Number.isInteger(status) ? "http" : "invalid-response");
  if (Number.isInteger(status)) error.upstreamStatus = status;
  if (reason) error.reason = reason;
  if (retryAfterMs) error.retryAfterMs = retryAfterMs;
  return error;
}

export function smartcarConfigFromEnv(env) {
  const clientId = env.SMARTCAR_CLIENT_ID?.trim();
  const clientSecret = env.SMARTCAR_CLIENT_SECRET?.trim();
  const redirectUri = env.SMARTCAR_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  // Smartcar client IDs come in several forms (a UUID, or "client_" plus letters and digits).
  if (!/^[A-Za-z0-9_.-]{8,100}$/.test(clientId)) {
    throw configError("De Smartcar-client-ID is ongeldig ingesteld: alleen letters, cijfers, _, . en - (zonder aanhalingstekens of spaties).", "invalid-client-id");
  }
  // Smartcar Connect needs the Application ID (Configuration → Application details), which differs
  // from the client ID for "client_…" credentials. Older apps used one value for both.
  const applicationId = env.SMARTCAR_APPLICATION_ID?.trim() || clientId;
  if (!/^[A-Za-z0-9_.-]{8,100}$/.test(applicationId)) {
    throw configError("De Smartcar-Application ID is ongeldig ingesteld: alleen letters, cijfers, _, . en - (zonder aanhalingstekens of spaties).", "invalid-application-id");
  }
  if (clientSecret.length < 8 || clientSecret.length > 500 || /\s|^["']|["']$/.test(clientSecret)) {
    throw configError("Het Smartcar-client secret is ongeldig ingesteld: controleer op aanhalingstekens of spaties.", "invalid-secret");
  }
  // The redirect must come back to this Northstar instance, so its origin must equal AUTH_URL.
  let redirect;
  try {
    redirect = new URL(redirectUri);
  } catch {
    redirect = null;
  }
  let appOrigin = null;
  try {
    appOrigin = new URL(env.AUTH_URL).origin;
  } catch {
    appOrigin = null;
  }
  const secureEnough = redirect?.protocol === "https:" || (redirect?.protocol === "http:" && env.NODE_ENV !== "production");
  if (!redirect || !secureEnough || redirect.origin !== appOrigin || redirect.pathname !== SMARTCAR_CALLBACK_PATH || redirect.search || redirect.hash) {
    throw configError("De Smartcar-redirect-URI moet naar /api/smartcar/callback op dit Northstar-adres wijzen.", "invalid-redirect");
  }
  return { clientId, clientSecret, applicationId, redirectUri: redirect.href };
}

// --- Connect flow state (CSRF protection) -------------------------------------------------
// The state is "<timestamp>.<nonce>.<hmac>", signed with AUTH_SECRET. It is valid for 15
// minutes and accepted once; used nonces are remembered in memory for that window.

function sign(value, secret) {
  return createHmac("sha256", secret).update(`smartcar-connect:${value}`).digest("base64url");
}

export function createConnectState(secret, now = Date.now()) {
  const value = `${now}.${randomBytes(16).toString("base64url")}`;
  return `${value}.${sign(value, secret)}`;
}

export function createStateVerifier({ now = () => Date.now() } = {}) {
  const used = new Map();
  return function verify(state, secret) {
    if (typeof state !== "string" || state.length > 200) return false;
    const parts = state.split(".");
    if (parts.length !== 3) return false;
    const [timestamp, nonce, signature] = parts;
    const expected = Buffer.from(sign(`${timestamp}.${nonce}`, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    const issuedAt = Number(timestamp);
    const currentTime = now();
    if (!Number.isFinite(issuedAt) || issuedAt > currentTime + 60_000 || currentTime - issuedAt > STATE_MAX_AGE_MS) return false;
    for (const [key, expiresAt] of used) if (expiresAt <= currentTime) used.delete(key);
    if (used.has(nonce)) return false;
    used.set(nonce, issuedAt + STATE_MAX_AGE_MS);
    return true;
  };
}

export function buildConnectUrl(config, state) {
  const query = new URLSearchParams({
    response_type: "none",
    application_id: config.applicationId,
    redirect_uri: config.redirectUri,
    mode: "live",
    scope: CONNECT_SCOPE.join(" "),
    state,
  });
  return `${SMARTCAR_CONNECT_URL}?${query}`;
}

// --- Response mapping ---------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isoOrNull = (value) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);

function firstError(json) {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  return isObject(errors[0]) ? errors[0] : isObject(json) && typeof json.code === "string" ? json : null;
}

export function needsReauthentication(error) {
  if (!isObject(error)) return false;
  if (error.resolution?.type === "REAUTHENTICATE") return true;
  if (error.code === "AUTHENTICATION_FAILED") return true;
  return error.code === "PERMISSION" && error.type === "CONNECTED_SERVICES_ACCOUNT";
}

// "type/code/resolution" from Smartcar's fixed vocabulary, for the reauth log line.
function describeError(error) {
  if (!isObject(error)) return "none";
  return `${word(error.type)}/${word(error.code)}/${word(error.resolution?.type)}`;
}

// Picks the live connection to use: a healthy one first, then the newest.
export function pickConnection(json) {
  const connections = (Array.isArray(json?.data) ? json.data : [])
    .filter((item) => isObject(item) && typeof item.relationships?.vehicle?.data?.id === "string")
    .filter((item) => (item.attributes?.vehicle?.mode ?? "live") === "live")
    .map((item) => ({
      vehicleId: item.relationships.vehicle.data.id,
      userId: typeof item.attributes?.user?.id === "string" ? item.attributes.user.id : typeof item.relationships?.user?.data?.id === "string" ? item.relationships.user.data.id : null,
      status: typeof item.attributes?.status?.name === "string" ? item.attributes.status.name : null,
      createdAt: isoOrNull(item.meta?.createdAt) ?? "",
      permissions: Array.isArray(item.attributes?.permissions) ? item.attributes.permissions.filter((value) => typeof value === "string").slice(0, 30) : null,
      vehicle: {
        make: typeof item.attributes?.vehicle?.make === "string" ? item.attributes.vehicle.make.slice(0, 40) : null,
        model: typeof item.attributes?.vehicle?.model === "string" ? item.attributes.vehicle.model.slice(0, 60) : null,
        year: Number.isInteger(item.attributes?.vehicle?.year) ? item.attributes.vehicle.year : null,
      },
    }))
    .filter((item) => item.userId);
  if (!connections.length) return null;
  const rank = (status) => (status === "ACTIVE" ? 0 : status === null ? 1 : 2);
  connections.sort((first, second) => rank(first.status) - rank(second.status) || second.createdAt.localeCompare(first.createdAt));
  return connections[0];
}

// "tractionbattery-stateofcharge", "TractionBattery.StateOfCharge" → "tractionbatterystateofcharge".
const normalizeCode = (code) => code.toLowerCase().replace(/[^a-z0-9]/g, "");
const SIGNAL_BY_NORMALIZED = new Map(Object.values(SIGNALS).map((code) => [normalizeCode(code), code]));

// Normalizes a signal resource (from the list or a single GET) to { code, ok, body, error, meta }.
// code is the canonical SIGNALS value, or null for a signal Northstar does not use.
function readSignal(resource) {
  if (!isObject(resource)) return null;
  const attributes = isObject(resource.attributes) ? resource.attributes : {};
  const rawCode = typeof attributes.code === "string" ? attributes.code : typeof resource.id === "string" ? resource.id : null;
  if (!rawCode) return null;
  const rawStatus = typeof attributes.status === "string" ? attributes.status : attributes.status?.value;
  const status = typeof rawStatus === "string" ? rawStatus.toUpperCase() : "SUCCESS";
  const body = isObject(attributes.body) ? attributes.body : "value" in attributes ? { value: attributes.value, unit: attributes.unit } : null;
  return {
    code: SIGNAL_BY_NORMALIZED.get(normalizeCode(rawCode)) ?? null,
    rawCode,
    status,
    ok: status === "SUCCESS" && body !== null,
    body,
    error: isObject(attributes.status?.error) ? attributes.status.error : null,
    oemUpdatedAt: isoOrNull(resource.meta?.oemUpdatedAt),
    retrievedAt: isoOrNull(resource.meta?.retrievedAt),
  };
}

const finite = (value) => {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
};
const bool = (value) => (typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : null);

function rangeInKm(body) {
  const value = finite(body?.value);
  if (value === null || value < 0) return null;
  const unit = String(body.unit ?? "km").toLowerCase();
  if (["km", "kilometers", "kilometres"].includes(unit)) return Math.round(value);
  if (["mi", "miles"].includes(unit)) return Math.round(value * 1.609344);
  return null;
}

// Maps the four signals to the card's values. Missing or failed signals become null, never 0.
export function mapSignals(signalsByCode) {
  const get = (code) => (signalsByCode.get(code)?.ok ? signalsByCode.get(code).body : null);
  const percent = finite(get(SIGNALS.stateOfCharge)?.value);
  const isCharging = bool(get(SIGNALS.isCharging)?.value);
  const cable = bool(get(SIGNALS.cableConnected)?.value);
  const times = [...signalsByCode.values()].filter((signal) => signal.ok);
  const latest = (key) => times.map((signal) => signal[key]).filter(Boolean).sort().at(-1) ?? null;
  return {
    batteryPercent: percent !== null && percent >= 0 && percent <= 100 ? Math.round(percent) : null,
    rangeKm: rangeInKm(get(SIGNALS.range)),
    isCharging,
    cableConnected: cable,
    reportedAt: latest("oemUpdatedAt"),
    retrievedAt: latest("retrievedAt"),
  };
}

// Fixed, owner-facing explanations for a failure without an earlier value to show.
export const UNAVAILABLE_MESSAGES = {
  "vehicle-offline": "Data tijdelijk niet beschikbaar: de auto slaapt of heeft geen bereik. Northstar probeert het later opnieuw.",
  "no-signals": "Data tijdelijk niet beschikbaar: Smartcar gaf geen batterij- of laadwaarden door. Controleer de toestemmingen onder Vehicle Access in het Smartcar-dashboard.",
  "rate-limited": "Data tijdelijk niet beschikbaar: te veel verzoeken bij Smartcar. Northstar probeert het later opnieuw.",
  "plan-limit": "Data tijdelijk niet beschikbaar: de maandlimiet van het Smartcar-plan is bereikt.",
  upstream: "Data tijdelijk niet beschikbaar: Smartcar is momenteel niet bereikbaar.",
};

function unavailableError(error) {
  error.status = 502;
  error.code = "vehicle_unavailable";
  error.message = UNAVAILABLE_MESSAGES[error.reason] ?? UNAVAILABLE_MESSAGES.upstream;
  return error;
}

// A log line that explains why no value could be read, built only from Smartcar's fixed
// vocabulary (field names, signal codes, status and error codes, value types). It never contains
// values, vehicle or user IDs, tokens or URLs.
const SAFE_WORD = /^[A-Za-z][A-Za-z0-9_.-]{0,60}$/;
const word = (value) => (typeof value === "string" && SAFE_WORD.test(value) ? value : "?");

function describeSignals({ listed, listedResources, signals, single }) {
  const keys = isObject(listed.json) ? Object.keys(listed.json).slice(0, 8).map(word).join(",") : typeof listed.json;
  const codes = listedResources.slice(0, 20).map((resource) => {
    const signal = readSignal(resource);
    return signal ? `${word(signal.rawCode)}:${word(signal.status)}` : "unreadable";
  });
  const wanted = Object.entries(SIGNALS).map(([name, code]) => {
    const signal = signals.get(code);
    if (!signal) return `${name}=missing`;
    const valueType = signal.body ? typeof signal.body.value : "nobody";
    return `${name}=${word(signal.status)}/${valueType}${signal.error ? `/${word(signal.error.code)}` : ""}`;
  });
  const singles = single.map((response) => String(response.status)).join(",") || "none";
  return `list status=${listed.status} keys=${keys} items=${listedResources.length} codes=${codes.join(",") || "none"} wanted=${wanted.join(",")} single=${singles}`;
}

// --- Service ------------------------------------------------------------------------------

// request({ method, url, headers, body }) must perform the HTTP call and resolve to
// { status, json, retryAfter } (retryAfter: the raw retry-after header or null).
export function createSmartcarService({
  request,
  now = () => Date.now(),
  ttlMs = 60 * 60 * 1000,
  minRefreshMs = 5 * 60 * 1000,
  retryMs = 5 * 60 * 1000,
  onError = () => {},
  onDiagnostic = () => {},
}) {
  let token = null;
  let cache = null; // { key, value, expiresAt, fetchedAt }
  let lastGood = null; // last successful "connected" value, kept for stale display
  let inFlight = null;
  let blocked = null; // { key, error, until } after a failure without a last good value

  async function accessToken(config, force = false) {
    if (!force && token && token.clientId === config.clientId && token.expiresAt > now()) return token.value;
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret });
    const response = await request({
      method: "POST",
      url: SMARTCAR_TOKEN_URL,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (response.status === 400 || response.status === 401) {
      throw configError("Smartcar weigerde de client-ID of het client secret. Controleer de instellingen in Render.", "invalid-credentials");
    }
    if (response.status < 200 || response.status >= 300) throw smartcarError("Smartcar-aanmelding mislukte.", { status: response.status });
    const value = response.json?.access_token;
    if (typeof value !== "string" || !value) {
      const error = smartcarError("Smartcar gaf geen geldig token.", { kind: "invalid-response" });
      error.diagnostic = `token status=${response.status} keys=${isObject(response.json) ? Object.keys(response.json).slice(0, 8).map(word).join(",") : typeof response.json}`;
      throw error;
    }
    const lifetime = Number.isFinite(response.json?.expires_in) ? response.json.expires_in : 3600;
    token = { clientId: config.clientId, value, expiresAt: now() + Math.max(60, lifetime - 120) * 1000 };
    return value;
  }

  // GET on the vehicle API with the app token; retries once with a fresh token on 401.
  async function apiGet(config, path, userId) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const bearer = await accessToken(config, attempt > 0);
      const response = await request({
        method: "GET",
        url: `${SMARTCAR_API}${path}`,
        headers: { authorization: `Bearer ${bearer}`, ...(userId ? { "sc-user-id": userId } : {}) },
      });
      if (response.status === 401 && attempt === 0) continue;
      return response;
    }
    throw new Error("unreachable");
  }

  // Logs why the card asks to re-authorize, using only fixed Smartcar codes (no IDs or tokens).
  function reauth(vehicle, source, detail) {
    onDiagnostic(`reauth_required source=${source} ${detail}`);
    return { state: "reauth_required", vehicle };
  }

  function failure(response, label) {
    const error = firstError(response.json);
    if (needsReauthentication(error)) return { reauth: true, detail: `status=${response.status} error=${describeError(error)}` };
    if (NOT_CONNECTED_CODES.has(error?.code)) return { notConnected: true };
    if (response.status === 401) {
      return { error: configError("Smartcar weigerde de toegang van Northstar. Controleer de instellingen in Render.", "invalid-credentials") };
    }
    const retryAfterSeconds = Number(response.retryAfter);
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.min(retryAfterSeconds, 24 * 3600) * 1000 : undefined;
    let reason = "upstream";
    if (response.status === 429) reason = "rate-limited";
    else if (error?.type === "BILLING") reason = "plan-limit";
    else if (["ASLEEP", "UNREACHABLE", "LOW_BATTERY", "VEHICLE_OFFLINE_FOR_SERVICE"].includes(error?.code)) reason = "vehicle-offline";
    return { error: smartcarError(`Smartcar ${label} mislukte.`, { status: response.status, reason, retryAfterMs }) };
  }

  async function load(config) {
    const connections = await apiGet(config, "/connections?filter%5Bvehicle.mode%5D=live&page%5Bsize%5D=50");
    if (connections.status < 200 || connections.status >= 300) {
      const result = failure(connections, "connections");
      if (result.reauth) return reauth(null, "connections", result.detail);
      if (result.notConnected) return { state: "not_connected", vehicle: null };
      throw result.error;
    }
    const connection = pickConnection(connections.json);
    if (!connection) return { state: "not_connected", vehicle: null };
    // DISABLED: Smartcar stopped calling Mercedes, the owner must reconnect. DEGRADED only means
    // repeated OEM sign-in failures while requests are still attempted, so the signals are still
    // read and only a re-authentication error from them asks for a new Connect flow.
    if (connection.status === "DISABLED") return reauth(connection.vehicle, "connection", "status=DISABLED");

    const vehiclePath = `/vehicles/${encodeURIComponent(connection.vehicleId)}/signals`;
    const listed = await apiGet(config, vehiclePath, connection.userId);
    if (listed.status < 200 || listed.status >= 300) {
      const result = failure(listed, "signals");
      if (result.reauth) return reauth(connection.vehicle, "signals", `${result.detail} connection=${word(connection.status)}`);
      if (result.notConnected) return { state: "not_connected", vehicle: null };
      throw result.error;
    }
    const signals = new Map();
    const listedResources = Array.isArray(listed.json?.data) ? listed.json.data : [];
    for (const resource of listedResources) {
      const signal = readSignal(resource);
      if (signal?.code) signals.set(signal.code, signal);
    }
    // The list call is undocumented about paging; fetch the two essential signals one by one
    // only if the list did not contain them at all.
    const missing = [SIGNALS.stateOfCharge, SIGNALS.range].filter((code) => !signals.has(code));
    const single = await Promise.all(missing.map((code) => apiGet(config, `${vehiclePath}/${code}`, connection.userId)));
    const reauthErrors = [];
    for (const response of single) {
      if (response.status >= 200 && response.status < 300) {
        const signal = readSignal(response.json?.data);
        if (signal?.code) signals.set(signal.code, signal);
      } else if (needsReauthentication(firstError(response.json))) {
        reauthErrors.push(firstError(response.json));
      }
    }
    for (const signal of signals.values()) if (needsReauthentication(signal.error)) reauthErrors.push(signal.error);
    const values = mapSignals(signals);
    if (values.batteryPercent === null && values.rangeKm === null && values.isCharging === null && values.cableConnected === null) {
      // One signal without permission must not hide the others: only ask for a new Connect flow
      // when nothing usable came back and Smartcar itself points to re-authentication.
      if (reauthErrors.length) {
        const granted = connection.permissions ? connection.permissions.map(word).join(",") || "none" : "unknown";
        return reauth(connection.vehicle, "signal", `error=${describeError(reauthErrors[0])} count=${reauthErrors.length} connection=${word(connection.status)} permissions=${granted}`);
      }
      const vehicleError = [...signals.values()].map((signal) => signal.error).find(Boolean);
      const reason = ["ASLEEP", "UNREACHABLE"].includes(vehicleError?.code) ? "vehicle-offline" : "no-signals";
      const error = smartcarError("Smartcar gaf geen bruikbare voertuigwaarden.", { kind: "invalid-response", reason });
      error.diagnostic = describeSignals({ listed, listedResources, signals, single });
      throw error;
    }
    return { state: "connected", vehicle: connection.vehicle, ...values };
  }

  async function get({ config, refresh = false }) {
    const key = config.clientId;
    const currentTime = now();
    if (cache && cache.key === key) {
      const fresh = cache.expiresAt > currentTime;
      const refreshAllowed = refresh && currentTime - cache.fetchedAt >= minRefreshMs;
      if (fresh && !refreshAllowed) return cache.value;
    }
    if (blocked && blocked.key === key && blocked.until > currentTime) {
      const error = unavailableError(smartcarError("Smartcar is tijdelijk niet bereikbaar.", { kind: blocked.error.kind, status: blocked.error.upstreamStatus, reason: blocked.error.reason }));
      error.repeated = true;
      throw error;
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const result = await load(config);
        const value = {
          ...result,
          stale: false,
          unavailableReason: null,
          updatedAt: new Date(now()).toISOString(),
        };
        if (result.state === "connected") lastGood = { key, value };
        cache = { key, value, expiresAt: now() + ttlMs, fetchedAt: now() };
        blocked = null;
        return value;
      } catch (error) {
        if (error.code === "invalid_config") throw error;
        if (error.diagnostic) onDiagnostic(error.diagnostic);
        const backoff = Math.max(retryMs, error.retryAfterMs ?? 0);
        if (lastGood && lastGood.key === key) {
          onError(error);
          const value = { ...lastGood.value, stale: true, unavailableReason: error.reason ?? "upstream" };
          cache = { key, value, expiresAt: now() + backoff, fetchedAt: now() };
          return value;
        }
        // No earlier value to show: remember the failure for the backoff period so repeated
        // dashboard opens do not keep calling Smartcar (rate and monthly limits).
        cache = null;
        blocked = { key, error, until: now() + backoff };
        throw unavailableError(error);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  // Called after a completed Connect flow so the next request looks the connection up again.
  function invalidate() {
    cache = null;
    blocked = null;
  }

  return { get, invalidate };
}
