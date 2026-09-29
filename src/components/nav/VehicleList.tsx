"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Reading } from "@/components/Reading";
import { DueBadge, VehicleMark } from "@/components/VehicleMark";
import { cn } from "@/lib/cn";
import type { VehicleSummary } from "@/lib/data";
import { hrefForVehicle } from "@/lib/nav";
import { useShell } from "./AppShell";
import { CheckIcon } from "./icons";

/** Where each vehicle in a switcher should link, keeping the current tab. */
export function useVehicleHref(): (id: string) => string {
  const pathname = usePathname();
  const search = useSearchParams();
  const { lastTab } = useShell();
  return (id) => hrefForVehicle(id, pathname, search.toString(), lastTab);
}

/** One row in the switcher: mark, name, reading, what is due. */
export function VehicleRowContent({
  v,
  current,
  roomy = false,
}: {
  v: VehicleSummary;
  current: boolean;
  roomy?: boolean;
}) {
  return (
    <>
      <VehicleMark color={v.color} photoId={v.photoAttachmentId} size={roomy ? "md" : "sm"} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", current && "font-semibold")}>{v.name}</span>
        {roomy && (
          <span className="block text-ink-muted">
            <Reading ticks={v.currentReadingTicks} units={v.units} size="sm" withUnit />
          </span>
        )}
      </span>
      {!roomy && <Reading ticks={v.currentReadingTicks} units={v.units} size="sm" className="text-ink-muted" />}
      <DueBadge count={v.attention} overdue={v.overdue} />
      <span className="flex w-5 shrink-0 justify-center">
        {current && <CheckIcon className="size-4" />}
      </span>
    </>
  );
}

export function isCurrent(v: VehicleSummary, activeId: string | null, onVehiclePage: boolean): boolean {
  return onVehiclePage && v.id === activeId;
}

export function AllVehiclesLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link href="/" className={className} onClick={onClick}>
      All vehicles
    </Link>
  );
}
