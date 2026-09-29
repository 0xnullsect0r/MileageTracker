/** The fixed swatch set. A free hex picker would let the switcher go illegible. */
export const VEHICLE_COLORS = ["blue", "green", "rust", "teal", "wine", "olive", "slate", "ochre"] as const;
export type VehicleColor = (typeof VEHICLE_COLORS)[number];

export const VEHICLE_COLOR_LABEL: Record<VehicleColor, string> = {
  blue: "Blue",
  green: "Green",
  rust: "Rust",
  teal: "Teal",
  wine: "Wine",
  olive: "Olive",
  slate: "Slate",
  ochre: "Ochre",
};

export function isVehicleColor(v: unknown): v is VehicleColor {
  return typeof v === "string" && (VEHICLE_COLORS as readonly string[]).includes(v);
}

/** A CSS colour for the swatch; muted ink when none is set. */
export function vehicleColor(color: string | null | undefined): string {
  return isVehicleColor(color) ? `var(--vc-${color})` : "var(--ink-muted)";
}
