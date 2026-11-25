import { describe, expect, it, vi } from "vitest";
import {
  SMARTCAR_API,
  SMARTCAR_TOKEN_URL,
  buildConnectUrl,
  createConnectState,
  createSmartcarService,
  createStateVerifier,
  mapSignals,
  pickConnection,
  smartcarConfigFromEnv,
} from "./smartcar.js";

const config = { clientId: "client_01ABCDEFGHJKMNPQRSTVWXYZ00", clientSecret: "super-secret-value", applicationId: "8229df9f-91a0-4ff0-a1ae-a1f38ee24d07", redirectUri: "https://northstar.example/api/smartcar/callback" };
const secret = "a-dummy-test-secret-that-is-long-enough";

const connection = (overrides = {}) => ({
  id: "conn-1",
  type: "connection",
  attributes: {
    status: { name: "ACTIVE" },
    permissions: ["read_battery", "read_charge"],
    vehicle: { make: "MERCEDES-BENZ", model: "CLA 250+", year: 2026, mode: "live", powertrainType: "BEV" },
    user: { id: "user-1" },
  },
  relationships: { vehicle: { data: { id: "veh-1" } } },
  meta: { createdAt: "2026-11-25T08:00:00Z" },
  ...overrides,
});

const signal = (code, body, { status = "SUCCESS", error, oemUpdatedAt = "2026-11-25T09:58:00Z" } = {}) => ({
  id: code,
  type: "signal",
  attributes: { code, name: code, group: code.split("-")[0], status: { value: status, ...(error ? { error } : {}) }, body },
  meta: { retrievedAt: "2026-11-25T10:00:00Z", oemUpdatedAt, ingestedAt: "2026-11-25T10:00:01Z" },
});

const allSignals = () => [
  signal("tractionbattery-stateofcharge", { value: 76.4, unit: "percent" }),
  signal("tractionbattery-range", { value: 312.6, unit: "km", type: "DEFAULT" }),
  signal("charge-ischarging", { value: false }),
  signal("charge-ischargingcableconnected", { value: true }, { oemUpdatedAt: "2026-11-25T09:59:00Z" }),
  signal("charge-voltage", { value: 0, unit: "volts" }),
];

const ok = (json) => ({ status: 200, json, retryAfter: null });
const tokenOk = () => ok({ access_token: "app-token-1", token_type: "Bearer", expires_in: 3600 });

// Routes mocked Smartcar calls by URL; each handler may be a response or a function.
function mockSmartcar(routes) {
  return vi.fn(async (call) => {
    const path = call.url === SMARTCAR_TOKEN_URL ? "token" : call.url.replace(SMARTCAR_API, "").split("?")[0];
    const handler = routes[path];
    if (!handler) throw new Error(`Unexpected Smartcar call: ${path}`);
    return typeof handler === "function" ? handler(call) : handler;
  });
}

const happyRoutes = (overrides = {}) => ({
  token: tokenOk(),
  "/connections": ok({ data: [connection()] }),
  "/vehicles/veh-1/signals": ok({ data: allSignals() }),
  ...overrides,
});

describe("smartcarConfigFromEnv", () => {
  const env = { SMARTCAR_CLIENT_ID: config.clientId, SMARTCAR_CLIENT_SECRET: config.clientSecret, SMARTCAR_APPLICATION_ID: config.applicationId, SMARTCAR_REDIRECT_URI: config.redirectUri, AUTH_URL: "https://northstar.example", NODE_ENV: "production" };

  it("returns null when not configured and the config when valid", () => {
    expect(smartcarConfigFromEnv({ ...env, SMARTCAR_CLIENT_SECRET: "" })).toBeNull();
    expect(smartcarConfigFromEnv(env)).toEqual(config);
  });

  it("uses the client ID for Connect when no separate Application ID is set", () => {
    expect(smartcarConfigFromEnv({ ...env, SMARTCAR_APPLICATION_ID: "" })?.applicationId).toBe(config.clientId);
    let error;
    try {
      smartcarConfigFromEnv({ ...env, SMARTCAR_APPLICATION_ID: "not valid!" });
    } catch (caught) {
      error = caught;
    }
    expect(error?.reason).toBe("invalid-application-id");
  });

  it("accepts client IDs with underscores and reports which credential is malformed", () => {
    expect(smartcarConfigFromEnv({ ...env, SMARTCAR_CLIENT_ID: "client_01M89G2A1D2Z9FCBPTT3GN64J4" })?.clientId).toBe("client_01M89G2A1D2Z9FCBPTT3GN64J4");
    const reason = (overrides) => {
      try {
        smartcarConfigFromEnv({ ...env, ...overrides });
      } catch (error) {
        return error.reason;
      }
      return null;
    };
    expect(reason({ SMARTCAR_CLIENT_ID: '"client_01M89G2A1D2Z9FCBPTT3GN64J4"' })).toBe("invalid-client-id");
    expect(reason({ SMARTCAR_CLIENT_SECRET: '"quoted-secret-value"' })).toBe("invalid-secret");
    expect(reason({ SMARTCAR_CLIENT_SECRET: "has a space inside" })).toBe("invalid-secret");
  });

  it("rejects a redirect URI that does not point back to this Northstar callback, without leaking values", () => {
    for (const redirect of ["https://evil.example/api/smartcar/callback", "https://northstar.example/other", "http://northstar.example/api/smartcar/callback"]) {
      let error;
      try {
        smartcarConfigFromEnv({ ...env, SMARTCAR_REDIRECT_URI: redirect });
      } catch (caught) {
        error = caught;
      }
      expect(error?.code).toBe("invalid_config");
      expect(error.message).not.toContain(config.clientSecret);
      expect(error.message).not.toContain("evil");
    }
  });
});

describe("connect state", () => {
  it("accepts a fresh signed state once and rejects tampered, reused or expired states", () => {
    let time = 1_000_000;
    const verify = createStateVerifier({ now: () => time });
    const state = createConnectState(secret, time);
    expect(verify(`${state}x`, secret)).toBe(false);
    expect(verify(state, "another-secret-of-sufficient-length")).toBe(false);
    expect(verify(state, secret)).toBe(true);
    expect(verify(state, secret)).toBe(false);
    const old = createConnectState(secret, time);
    time += 16 * 60 * 1000;
    expect(verify(old, secret)).toBe(false);
  });

  it("builds a read-only v3 Connect URL without a secret or scope override", () => {
    const url = new URL(buildConnectUrl(config, "state-1"));
    expect(url.origin).toBe("https://connect.smartcar.com");
    expect(url.searchParams.get("response_type")).toBe("none");
    expect(url.searchParams.get("application_id")).toBe(config.applicationId);
    expect(url.href).not.toContain(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("mode")).toBe("live");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.href).not.toContain(config.clientSecret);
  });
});

describe("mapping", () => {
  it("maps the four signals and never turns missing values into zero", () => {
    const signals = new Map(allSignals().slice(0, 1).map((item) => [item.attributes.code, { code: item.attributes.code, ok: true, body: item.attributes.body, oemUpdatedAt: item.meta.oemUpdatedAt, retrievedAt: item.meta.retrievedAt }]));
    expect(mapSignals(signals)).toEqual({ batteryPercent: 76, rangeKm: null, isCharging: null, cableConnected: null, reportedAt: "2026-11-25T09:58:00Z", retrievedAt: "2026-11-25T10:00:00Z" });
  });

  it("prefers an active live connection and ignores simulated vehicles", () => {
    const simulated = connection({ relationships: { vehicle: { data: { id: "sim-1" } } } });
    simulated.attributes = { ...simulated.attributes, vehicle: { ...simulated.attributes.vehicle, mode: "simulated" } };
    const disabled = connection({ relationships: { vehicle: { data: { id: "old" } } }, meta: { createdAt: "2026-11-26T00:00:00Z" } });
    disabled.attributes = { ...disabled.attributes, status: { name: "DISABLED" } };
    expect(pickConnection({ data: [simulated, disabled, connection()] })?.vehicleId).toBe("veh-1");
    expect(pickConnection({ data: [simulated] })).toBeNull();
  });
});

describe("createSmartcarService", () => {
  it("reads the vehicle with an app token and the sc-user-id header, using only GET requests", async () => {
    const request = mockSmartcar(happyRoutes());
    const service = createSmartcarService({ request, now: () => Date.parse("2026-11-25T10:00:00Z") });
    const value = await service.get({ config });
    expect(value).toEqual({
      state: "connected",
      vehicle: { make: "MERCEDES-BENZ", model: "CLA 250+", year: 2026 },
      batteryPercent: 76,
      rangeKm: 313,
      isCharging: false,
      cableConnected: true,
      reportedAt: "2026-11-25T09:59:00.000Z",
      retrievedAt: "2026-11-25T10:00:00.000Z",
      stale: false,
      unavailableReason: null,
      updatedAt: "2026-11-25T10:00:00.000Z",
    });
    const [tokenCall, connectionsCall, signalsCall] = request.mock.calls.map(([call]) => call);
    expect(tokenCall.method).toBe("POST");
    expect(new URLSearchParams(tokenCall.body).get("grant_type")).toBe("client_credentials");
    expect(connectionsCall.headers.authorization).toBe("Bearer app-token-1");
    expect(signalsCall.headers["sc-user-id"]).toBe("user-1");
    expect(request.mock.calls.slice(1).every(([call]) => call.method === "GET")).toBe(true);
    expect(JSON.stringify(value)).not.toMatch(/app-token|super-secret|user-1|veh-1/);
  });

  it("caches for the TTL, throttles manual refreshes and reuses the token", async () => {
    let time = Date.parse("2026-11-25T10:00:00Z");
    const request = mockSmartcar(happyRoutes());
    const service = createSmartcarService({ request, now: () => time });
    await service.get({ config });
    time += 2 * 60 * 1000;
    await service.get({ config, refresh: true });
    expect(request).toHaveBeenCalledTimes(3);
    time += 4 * 60 * 1000;
    await service.get({ config, refresh: true });
    expect(request).toHaveBeenCalledTimes(5); // connections + signals, token reused
    time += 59 * 60 * 1000;
    await service.get({ config });
    expect(request).toHaveBeenCalledTimes(5);
  });

  it("requests a new app token after it expires or when the API rejects it", async () => {
    let time = 0;
    let tokens = 0;
    let rejected = false;
    const request = mockSmartcar(happyRoutes({
      token: () => ok({ access_token: `token-${++tokens}`, expires_in: 3600 }),
      "/connections": (call) => {
        if (call.headers.authorization === "Bearer token-2" && !rejected) {
          rejected = true;
          return { status: 401, json: { errors: [{ type: "AUTHENTICATION", code: "UNAUTHORIZED" }] }, retryAfter: null };
        }
        return ok({ data: [connection()] });
      },
    }));
    const service = createSmartcarService({ request, now: () => time });
    await service.get({ config });
    time += 2 * 60 * 60 * 1000; // past the TTL and the token lifetime
    const value = await service.get({ config });
    expect(value.state).toBe("connected");
    expect(tokens).toBe(3);
  });

  it("reports not_connected when there is no live connection", async () => {
    const service = createSmartcarService({ request: mockSmartcar(happyRoutes({ "/connections": ok({ data: [] }) })) });
    expect(await service.get({ config })).toMatchObject({ state: "not_connected", vehicle: null, stale: false });
  });

  it("reports reauth_required for a degraded connection or a REAUTHENTICATE error", async () => {
    const degraded = connection();
    degraded.attributes = { ...degraded.attributes, status: { name: "DEGRADED" } };
    const first = createSmartcarService({ request: mockSmartcar(happyRoutes({ "/connections": ok({ data: [degraded] }) })) });
    expect((await first.get({ config })).state).toBe("reauth_required");

    const revoked = { status: 400, json: { errors: [{ type: "CONNECTED_SERVICES_ACCOUNT", code: "PERMISSION", resolution: { type: "REAUTHENTICATE" } }] }, retryAfter: null };
    const second = createSmartcarService({ request: mockSmartcar(happyRoutes({ "/vehicles/veh-1/signals": revoked })) });
    expect((await second.get({ config })).state).toBe("reauth_required");

    const perSignal = signal("tractionbattery-stateofcharge", null, { status: "ERROR", error: { type: "CONNECTED_SERVICES_ACCOUNT", code: "AUTHENTICATION_FAILED" } });
    const third = createSmartcarService({ request: mockSmartcar(happyRoutes({ "/vehicles/veh-1/signals": ok({ data: [perSignal] }) })) });
    expect((await third.get({ config })).state).toBe("reauth_required");
  });

  it("accepts dotted signal codes, a string status and values sent as strings", async () => {
    const odd = (code, value) => ({ id: code, type: "signal", attributes: { code, status: "success", body: { value } }, meta: { oemUpdatedAt: "2026-11-25T09:58:00Z" } });
    const request = mockSmartcar(happyRoutes({
      "/vehicles/veh-1/signals": ok({ data: [odd("TractionBattery.StateOfCharge", "64"), odd("TractionBattery.Range", "250"), odd("Charge.IsCharging", "true")] }),
    }));
    const value = await createSmartcarService({ request }).get({ config });
    expect(value).toMatchObject({ batteryPercent: 64, rangeKm: 250, isCharging: true, cableConnected: null });
  });

  it("explains a response without usable values and logs only a safe diagnostic", async () => {
    const onDiagnostic = vi.fn();
    const unavailable = (code) => signal(code, null, { status: "UNAVAILABLE" });
    const request = mockSmartcar(happyRoutes({
      "/vehicles/veh-1/signals": ok({ data: [unavailable("tractionbattery-stateofcharge"), unavailable("tractionbattery-range"), signal("location-preciselocation", { latitude: 50.98, longitude: 5.05 })] }),
    }));
    const error = await createSmartcarService({ request, onDiagnostic }).get({ config }).catch((caught) => caught);
    expect(error).toMatchObject({ status: 502, code: "vehicle_unavailable", reason: "no-signals" });
    expect(error.message).toMatch(/Vehicle Access/);
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    const line = onDiagnostic.mock.calls[0][0];
    expect(line).toContain("stateOfCharge=UNAVAILABLE");
    expect(line).toContain("isCharging=missing");
    expect(line).toContain("location-preciselocation:SUCCESS");
    expect(line).not.toMatch(/50\.98|5\.05|veh-1|user-1|app-token/);
  });

  it("falls back to single-signal requests when the list misses battery or range", async () => {
    const request = mockSmartcar(happyRoutes({
      "/vehicles/veh-1/signals": ok({ data: [signal("charge-ischarging", { value: true })] }),
      "/vehicles/veh-1/signals/tractionbattery-stateofcharge": ok({ data: signal("tractionbattery-stateofcharge", { value: 55, unit: "percent" }), included: {} }),
      "/vehicles/veh-1/signals/tractionbattery-range": ok({ data: signal("tractionbattery-range", { value: 100, unit: "mi" }), included: {} }),
    }));
    const value = await createSmartcarService({ request }).get({ config });
    expect(value).toMatchObject({ batteryPercent: 55, rangeKm: 161, isCharging: true, cableConnected: null });
  });

  it("shows the last good value as stale when the car is asleep, then backs off", async () => {
    let time = 0;
    let asleep = false;
    const onError = vi.fn();
    const request = mockSmartcar(happyRoutes({
      "/vehicles/veh-1/signals": () => asleep
        ? { status: 409, json: { errors: [{ type: "VEHICLE_STATE", code: "ASLEEP" }] }, retryAfter: null }
        : ok({ data: allSignals() }),
    }));
    const service = createSmartcarService({ request, now: () => time, onError });
    await service.get({ config });
    asleep = true;
    time += 61 * 60 * 1000;
    const stale = await service.get({ config });
    expect(stale).toMatchObject({ state: "connected", batteryPercent: 76, stale: true, unavailableReason: "vehicle-offline", updatedAt: "1970-01-01T00:00:00.000Z" });
    expect(onError).toHaveBeenCalledTimes(1);
    const calls = request.mock.calls.length;
    time += 60 * 1000;
    await service.get({ config, refresh: true });
    expect(request.mock.calls.length).toBe(calls);
  });

  it("honours retry-after on a rate limit and throws 502 without a previous value", async () => {
    let time = 0;
    const limited = { status: 429, json: { errors: [{ type: "RATE_LIMIT", code: "VEHICLE" }] }, retryAfter: "1800" };
    const request = mockSmartcar(happyRoutes({ "/vehicles/veh-1/signals": limited }));
    const service = createSmartcarService({ request, now: () => time });
    await expect(service.get({ config })).rejects.toMatchObject({ status: 502, reason: "rate-limited" });
    const calls = request.mock.calls.length;
    time += 20 * 60 * 1000;
    await expect(service.get({ config })).rejects.toMatchObject({ status: 502 });
    expect(request.mock.calls.length).toBe(calls);
    time += 11 * 60 * 1000;
    await expect(service.get({ config })).rejects.toMatchObject({ status: 502 });
    expect(request.mock.calls.length).toBeGreaterThan(calls);
  });

  it("turns rejected credentials into a fixed configuration error without the secret", async () => {
    const service = createSmartcarService({ request: mockSmartcar({ token: { status: 401, json: { error: "invalid_client" }, retryAfter: null } }) });
    const error = await service.get({ config }).catch((caught) => caught);
    expect(error.code).toBe("invalid_config");
    expect(error.message).not.toContain(config.clientSecret);
  });

  it("looks the connection up again after invalidate (completed Connect flow)", async () => {
    let connected = false;
    const request = mockSmartcar(happyRoutes({ "/connections": () => ok({ data: connected ? [connection()] : [] }) }));
    const service = createSmartcarService({ request });
    expect((await service.get({ config })).state).toBe("not_connected");
    connected = true;
    expect((await service.get({ config })).state).toBe("not_connected");
    service.invalidate();
    expect((await service.get({ config })).state).toBe("connected");
  });
});
