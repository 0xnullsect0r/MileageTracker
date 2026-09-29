"use client";

import Link from "next/link";
import { Reading } from "@/components/Reading";
import { DueBadge, VehicleMark } from "@/components/VehicleMark";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TAB_LABEL, type VehicleTab, vehiclePath } from "@/lib/nav";
import type { VehicleUnits } from "@/lib/units";
import { vehicleColor } from "@/lib/vehicle-colors";
import { useShell } from "./AppShell";
import { CloseIcon } from "./icons";

const DESKTOP_TABS: VehicleTab[] = ["log", "fuel", "service", "docs", "settings"];

export function VehicleHeader({
  id,
  name,
  subtitle,
  color,
  photoId,
  readingTicks,
  units,
}: {
  id: string;
  name: string;
  subtitle: string | null;
  color: string | null;
  photoId: string | null;
  readingTicks: number | null;
  units: VehicleUnits;
}) {
  const { tab, vehicles } = useShell();
  const summary = vehicles.find((v) => v.id === id);

  // Adding an entry is a single task done one-handed: no chrome, just a way out.
  if (tab === "add") {
    return (
      <div className="flex items-center justify-end px-4 pt-2 sm:px-8">
        <Link
          href={vehiclePath(id, "log")}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <CloseIcon className="size-4" /> Cancel
        </Link>
      </div>
    );
  }

  // The log is the one full-bleed screen; the header follows it.
  const frame = tab === "log" ? "px-4 sm:px-8" : "mx-auto max-w-[1400px] px-4 sm:px-8";

  return (
    <div className={cn(frame, "pt-5 md:pt-8")}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {photoId && <VehicleMark color={color} photoId={photoId} size="lg" className="hidden sm:block" />}
          <div className="min-w-0 border-l-[3px] pl-3" style={{ borderLeftColor: vehicleColor(color) }}>
            {subtitle && (
              <span className="block truncate text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                {subtitle}
              </span>
            )}
            <h1 className="truncate text-[1.625rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">{name}</h1>
          </div>
        </div>
        <Reading ticks={readingTicks} units={units} size="lg" withUnit />
      </div>

      {/* Desktop: the tabs live here. Phone: in the bottom bar, with the
          two occasional ones kept as plain links. */}
      <nav aria-label={`${name} pages`} className="mt-5 hidden items-end gap-6 border-b border-rule md:flex">
        {DESKTOP_TABS.map((t) => (
          <Link
            key={t}
            href={vehiclePath(id, t)}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 text-sm",
              tab === t ? "border-ink font-semibold text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {TAB_LABEL[t]}
            {t === "service" && summary && <DueBadge count={summary.attention} overdue={summary.overdue} />}
          </Link>
        ))}
        <Link href={vehiclePath(id, "add")} className={buttonClass("primary", "mb-2 ml-auto")}>
          Add entry
        </Link>
      </nav>
      <nav aria-label={`More ${name} pages`} className="mt-2 flex gap-5 border-b border-rule md:hidden">
        {(["docs", "settings"] as const).map((t) => (
          <Link
            key={t}
            href={vehiclePath(id, t)}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 text-sm",
              tab === t ? "border-ink font-semibold text-ink" : "border-transparent text-ink-muted",
            )}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
