"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { VehicleSummary } from "@/lib/data";
import { COOKIE_TAB, COOKIE_VEHICLE, type VehicleTab, isVehicleTab, tabFromPath, vehicleIdFromPath } from "@/lib/nav";
import { BottomBar } from "./BottomBar";
import { TopBar, type ShellUser } from "./TopBar";

interface ShellState {
  vehicles: VehicleSummary[];
  /** The vehicle on screen, or the last one used when on a fleet page. */
  activeId: string | null;
  /** True only on a /vehicles/[id] page. */
  onVehiclePage: boolean;
  tab: VehicleTab | null;
  lastTab: VehicleTab | null;
}

const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const s = useContext(ShellContext);
  if (!s) throw new Error("useShell outside AppShell");
  return s;
}

function remember(name: string, value: string) {
  // A UI preference, not a secret: readable by the page, a year long.
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * The frame around every signed-in page: the top bar, the phone's bottom
 * bar, and the memory of which vehicle and tab you were last on.
 */
export function AppShell({
  user,
  vehicles,
  initialVehicleId,
  initialTab,
  children,
}: {
  user: ShellUser;
  vehicles: VehicleSummary[];
  initialVehicleId: string | null;
  initialTab: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const known = (id: string | null) => (id && vehicles.some((v) => v.id === id) ? id : null);

  const [lastVehicle, setLastVehicle] = useState<string | null>(known(initialVehicleId));
  const [lastTab, setLastTab] = useState<VehicleTab | null>(isVehicleTab(initialTab) ? initialTab : null);

  const pathVehicle = known(vehicleIdFromPath(pathname));
  const tab = tabFromPath(pathname);

  useEffect(() => {
    if (pathVehicle && pathVehicle !== lastVehicle) {
      setLastVehicle(pathVehicle);
      remember(COOKIE_VEHICLE, pathVehicle);
    }
    // "Add entry" is a task, not a place — returning to it by default would
    // surprise more than it helps.
    if (tab && tab !== "add" && tab !== lastTab) {
      setLastTab(tab);
      remember(COOKIE_TAB, tab);
    }
  }, [pathVehicle, tab, lastVehicle, lastTab]);

  const state: ShellState = {
    vehicles,
    activeId: pathVehicle ?? known(lastVehicle) ?? vehicles[0]?.id ?? null,
    onVehiclePage: pathVehicle !== null,
    tab,
    lastTab,
  };

  const showBottomBar = vehicles.length > 0 && tab !== "add";

  return (
    <ShellContext.Provider value={state}>
      <TopBar user={user} />
      <div className={showBottomBar ? "pb-bar" : undefined}>{children}</div>
      {showBottomBar && <BottomBar />}
    </ShellContext.Provider>
  );
}
