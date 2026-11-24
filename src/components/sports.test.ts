import { describe, expect, it } from "vitest";
import { finalStatus } from "./sports";

describe("finalStatus", () => {
  it("translates ESPN final statuses to Dutch", () => {
    expect(finalStatus("Final")).toBe("Einde");
    expect(finalStatus("FT")).toBe("Einde");
    expect(finalStatus("")).toBe("Einde");
    expect(finalStatus("Final/OT")).toBe("Einde (OT)");
    expect(finalStatus("AET")).toBe("Einde (verl.)");
    expect(finalStatus("Postponed")).toBe("Uitgesteld");
  });
});
