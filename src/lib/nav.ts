/**
 * Vehicle routing, shared by server and client.
 *
 * Switching vehicle keeps the tab you are on: /vehicles/A/fuel becomes
 * /vehicles/B/fuel. Off a vehicle page, the last tab you used is remembered
 * in a cookie and reused.
 */

export const VEHICLE_TABS = ["log", "fuel", "service", "docs", "settings", "add"] as const;
export type VehicleTab = (typeof VEHICLE_TABS)[number];

export const TAB_LABEL: Record<VehicleTab, string> = {
  log: "Log",
  fuel: "Fuel",
  service: "Service",
  docs: "Documents",
  settings: "Settings",
  add: "Add entry",
};

const SEGMENT: Record<VehicleTab, string> = {
  log: "entries",
  fuel: "fuel",
  service: "service",
  docs: "docs",
  settings: "settings",
  add: "entries/new",
};

export const COOKIE_VEHICLE = "lb_vehicle";
export const COOKIE_TAB = "lb_tab";

export function isVehicleTab(v: unknown): v is VehicleTab {
  return typeof v === "string" && (VEHICLE_TABS as readonly string[]).includes(v);
}

export function vehiclePath(id: string, tab: VehicleTab = "log"): string {
  return `/vehicles/${id}/${SEGMENT[tab]}`;
}

/** The vehicle a path belongs to, or null ("/vehicles/new" is not one). */
export function vehicleIdFromPath(pathname: string): string | null {
  const m = /^\/vehicles\/([^/]+)/.exec(pathname);
  if (!m || m[1] === "new") return null;
  return decodeURIComponent(m[1]!);
}

/** The tab a vehicle path is on. An entry's edit page counts as the log. */
export function tabFromPath(pathname: string): VehicleTab | null {
  if (vehicleIdFromPath(pathname) === null) return null;
  const rest = pathname.split("/").slice(3).filter(Boolean);
  switch (rest[0]) {
    case undefined:
      return "log";
    case "entries":
      return rest[1] === "new" ? "add" : "log";
    case "fuel":
    case "service":
    case "docs":
    case "settings":
      return rest[0];
    default:
      return "log";
  }
}

/**
 * Where picking `targetId` from the switcher should go.
 *
 * On a vehicle page: the same tab. On the reports page: the same report for
 * the other vehicle. Anywhere else: the last tab used, or the log.
 */
export function hrefForVehicle(
  targetId: string,
  pathname: string,
  search: string,
  lastTab: string | null | undefined,
): string {
  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    const params = new URLSearchParams(search);
    params.set("vehicle", targetId);
    return `/reports?${params.toString()}`;
  }
  const tab = tabFromPath(pathname) ?? (isVehicleTab(lastTab) ? lastTab : "log");
  return vehiclePath(targetId, tab);
}
