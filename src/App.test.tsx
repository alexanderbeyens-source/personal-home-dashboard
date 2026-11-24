// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const notConfigured = { error: "This integration is not configured on the server.", code: "not_configured" };

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function mockApi(overrides: Record<string, () => Response> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://localhost").pathname;
    if (overrides[path]) return overrides[path]();
    if (path === "/api/auth/session") return jsonResponse({ user: { id: "1" } });
    if (path === "/api/auth/csrf") return jsonResponse({ csrfToken: "csrf" });
    if (path === "/api/calendar" || path === "/api/home-assistant") return jsonResponse(notConfigured, 503);
    if (path === "/api/projects") return jsonResponse([]);
    return jsonResponse({ error: "Live data is temporarily unavailable." }, 503);
  }));
}

describe("Dashboard optional integrations", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hides unconfigured Home Assistant and Projects panels and labels the agenda as not configured", async () => {
    mockApi();
    render(<App />);

    const agenda = await screen.findByRole("heading", { name: "Up next" });
    const agendaPanel = agenda.closest("section");
    await waitFor(() => expect(agendaPanel?.querySelector('[role="status"]')?.textContent).toBe("Not configured on the server"));
    expect(agendaPanel?.querySelector(".has-error")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Home, connected" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Made by you" })).toBeNull();
    expect(screen.queryByText("Mobility & Home")).toBeNull();
  });

  it("shows the Home Assistant and Projects panels once they return data", async () => {
    mockApi({
      "/api/home-assistant": () => jsonResponse({ devices: [{ name: "Lamp", state: "on" }], temperature: null, vacuum: null }),
      "/api/projects": () => jsonResponse([{ name: "Portfolio", url: "https://example.com" }]),
    });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Home, connected" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Made by you" })).toBeTruthy();
    expect(screen.getByText("Portfolio")).toBeTruthy();
  });
});
