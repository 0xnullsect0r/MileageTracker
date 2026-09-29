/**
 * The usual service items, with the usual intervals.
 *
 * Static data, not a table, so it versions with the code. Every value is a
 * starting point — the form lets you change it before it is saved. Distances
 * are given for both miles and kilometres rather than converted, because a
 * converted interval (8,046.72 km) is not one anybody uses.
 */
import type { DueMode } from "./maintenance";
import { type VehicleUnits, ticksPerUnit } from "./units";

export interface Preset {
  key: string;
  name: string;
  meter: "DISTANCE" | "HOURS";
  /** Interval in miles / km / hours. */
  miles?: number;
  km?: number;
  hours?: number;
  months?: number;
}

export const PRESETS: Preset[] = [
  { key: "oil", name: "Oil & filter", meter: "DISTANCE", miles: 5000, km: 8000, months: 6 },
  { key: "tire-rotation", name: "Tire rotation", meter: "DISTANCE", miles: 6000, km: 10000, months: 6 },
  { key: "engine-air-filter", name: "Engine air filter", meter: "DISTANCE", miles: 15000, km: 25000, months: 12 },
  { key: "cabin-air-filter", name: "Cabin air filter", meter: "DISTANCE", miles: 15000, km: 25000, months: 12 },
  { key: "brake-inspection", name: "Brake inspection", meter: "DISTANCE", miles: 12000, km: 20000, months: 12 },
  { key: "brake-fluid", name: "Brake fluid", meter: "DISTANCE", months: 24 },
  { key: "coolant", name: "Coolant", meter: "DISTANCE", miles: 60000, km: 100000, months: 60 },
  { key: "transmission-fluid", name: "Transmission fluid", meter: "DISTANCE", miles: 60000, km: 100000 },
  { key: "spark-plugs", name: "Spark plugs", meter: "DISTANCE", miles: 60000, km: 100000 },
  { key: "tires", name: "Tires", meter: "DISTANCE", miles: 40000, km: 65000 },
  { key: "battery", name: "Battery test", meter: "DISTANCE", months: 12 },
  { key: "wipers", name: "Wiper blades", meter: "DISTANCE", months: 12 },

  { key: "h-engine-oil", name: "Engine oil & filter", meter: "HOURS", hours: 100, months: 12 },
  { key: "h-air-filter", name: "Air filter", meter: "HOURS", hours: 250 },
  { key: "h-fuel-filter", name: "Fuel filter", meter: "HOURS", hours: 250 },
  { key: "h-hydraulic", name: "Hydraulic fluid", meter: "HOURS", hours: 500 },
  { key: "h-grease", name: "Grease fittings", meter: "HOURS", hours: 10 },
  { key: "h-spark-plug", name: "Spark plug", meter: "HOURS", hours: 100, months: 12 },
  { key: "h-chain", name: "Chain clean & lube", meter: "HOURS", hours: 5 },
  { key: "h-valves", name: "Valve clearance check", meter: "HOURS", hours: 50 },
];

export function presetsFor(units: Pick<VehicleUnits, "meterType">): Preset[] {
  return PRESETS.filter((p) => p.meter === units.meterType);
}

export function presetByKey(key: string): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}

/** The interval in display units for this vehicle, or null for date-only. */
export function presetEvery(p: Preset, units: VehicleUnits): number | null {
  if (units.meterType === "HOURS") return p.hours ?? null;
  return (units.distanceUnit === "KM" ? p.km : p.miles) ?? null;
}

export function presetIntervals(
  p: Preset,
  units: VehicleUnits,
): { intervalTicks: number | null; intervalMonths: number | null; dueMode: DueMode } {
  const every = presetEvery(p, units);
  const intervalTicks = every === null ? null : every * ticksPerUnit(units);
  const intervalMonths = p.months ?? null;
  const dueMode: DueMode = intervalTicks && intervalMonths ? "EITHER" : intervalTicks ? "READING" : "DATE";
  return { intervalTicks, intervalMonths, dueMode };
}
