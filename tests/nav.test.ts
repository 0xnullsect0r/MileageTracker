import { describe, expect, it } from "vitest";
import { hrefForVehicle, tabFromPath, vehicleIdFromPath, vehiclePath } from "../src/lib/nav";

describe("nav", () => {
  it("reads the vehicle and tab from a path", () => {
    expect(vehicleIdFromPath("/vehicles/abc/fuel")).toBe("abc");
    expect(vehicleIdFromPath("/vehicles/new")).toBeNull();
    expect(vehicleIdFromPath("/reports")).toBeNull();
    expect(tabFromPath("/vehicles/abc/entries")).toBe("log");
    expect(tabFromPath("/vehicles/abc/entries/new")).toBe("add");
    expect(tabFromPath("/vehicles/abc/entries/e1")).toBe("log");
    expect(tabFromPath("/vehicles/abc/docs")).toBe("docs");
    expect(tabFromPath("/")).toBeNull();
  });

  it("keeps the tab when switching from a vehicle page", () => {
    expect(hrefForVehicle("B", "/vehicles/A/fuel", "", "service")).toBe("/vehicles/B/fuel");
    expect(hrefForVehicle("B", "/vehicles/A/entries/e1", "", null)).toBe("/vehicles/B/entries");
    expect(hrefForVehicle("B", "/vehicles/A/entries/new", "", null)).toBe("/vehicles/B/entries/new");
  });

  it("uses the remembered tab elsewhere, falling back to the log", () => {
    expect(hrefForVehicle("B", "/", "", "service")).toBe("/vehicles/B/service");
    expect(hrefForVehicle("B", "/", "", "nonsense")).toBe("/vehicles/B/entries");
    expect(hrefForVehicle("B", "/import", "", undefined)).toBe(vehiclePath("B"));
  });

  it("swaps the vehicle in place on reports", () => {
    expect(hrefForVehicle("B", "/reports", "?year=2025&vehicle=A", null)).toBe("/reports?year=2025&vehicle=B");
  });
});
