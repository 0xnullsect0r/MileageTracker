import { cn } from "@/lib/cn";
import { vehicleColor } from "@/lib/vehicle-colors";

/**
 * How a vehicle is told apart at a glance: its photo when it has one,
 * otherwise a small square of its swatch colour.
 */
export function VehicleMark({
  color,
  photoId,
  size = "sm",
  className,
}: {
  color: string | null;
  photoId?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "size-3", md: "size-8", lg: "size-14" }[size];
  if (photoId && size !== "sm") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- auth-gated route, not optimisable
      <img
        src={`/attachments/${photoId}?thumb=1`}
        alt=""
        className={cn(box, "shrink-0 rounded-[2px] object-cover", className)}
        style={{ outline: `2px solid ${vehicleColor(color)}`, outlineOffset: "1px" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(size === "sm" ? "size-3" : "size-3.5", "inline-block shrink-0 rounded-[1px]", className)}
      style={{ background: vehicleColor(color) }}
    />
  );
}

/** A count of things needing attention. A mono numeral, never a red dot. */
export function DueBadge({ count, overdue = 0, className }: { count: number; overdue?: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "num inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[2px] border px-1 text-[0.75rem] font-semibold leading-none",
        overdue > 0 ? "border-signal bg-signal text-paper" : "border-signal text-signal",
        className,
      )}
    >
      {count}
      <span className="sr-only"> {count === 1 ? "item needs" : "items need"} attention</span>
    </span>
  );
}
