// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobilityHomePage } from "./MobilityHomePage";

describe("MobilityHomePage", () => {
  it("shows integration limitations without presenting device status as live data", () => {
    render(
      <MobilityHomePage
        user={{ name: "Signed in" }}
        csrfToken="csrf"
        signOutError={null}
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Mobility & Home." })).toBeTruthy();
    expect(screen.getByText("Access unverified")).toBeTruthy();
    expect(screen.getByText("Requires Home Assistant")).toBeTruthy();
    expect(screen.getAllByText("Never — no connection configured")).toHaveLength(2);
    expect(screen.getAllByText("Not available")).toHaveLength(7);
    expect(screen.getByRole("status").textContent).toContain("No device status or update time is being simulated.");
  });
});
