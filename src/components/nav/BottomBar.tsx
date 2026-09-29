"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { DueBadge, VehicleMark } from "@/components/VehicleMark";
import { cn } from "@/lib/cn";
import { type VehicleTab, vehiclePath } from "@/lib/nav";
import { useShell } from "./AppShell";
import { ChevronUp, CloseIcon, FuelIcon, LogIcon, PlusIcon, ServiceIcon } from "./icons";
import { VehicleRowContent, isCurrent, useVehicleHref } from "./VehicleList";

const LABEL = "text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.06em]";

/**
 * The phone's bottom bar: the vehicle, its three everyday tabs, and Add —
 * all within reach of a thumb. Switching vehicle keeps the tab you are on.
 */
export function BottomBar() {
  const { vehicles, activeId, onVehiclePage, tab } = useShell();
  const active = vehicles.find((v) => v.id === activeId) ?? null;
  if (!active) return null;

  const tabs: [VehicleTab, string, (p: { className?: string }) => React.ReactNode][] = [
    ["log", "Log", LogIcon],
    ["fuel", "Fuel", FuelIcon],
    ["service", "Service", ServiceIcon],
  ];

  return (
    <nav
      aria-label="Vehicle"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper md:hidden"
    >
      <div className="grid h-16 grid-cols-[minmax(0,2.1fr)_repeat(3,minmax(0,1fr))_4.25rem]">
        <VehicleSheet />
        {tabs.map(([t, label, Icon]) => {
          const on = onVehiclePage && tab === t;
          return (
            <Link
              key={t}
              href={vehiclePath(active.id, t)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 border-t-2",
                on ? "border-ink text-ink" : "border-transparent text-ink-muted",
              )}
            >
              <Icon className="size-[22px]" />
              <span className={LABEL}>{label}</span>
              {t === "service" && (
                <DueBadge count={active.attention} overdue={active.overdue} className="absolute right-1 top-1.5" />
              )}
            </Link>
          );
        })}
        <div className="flex items-center justify-center p-1.5">
          <Link
            href={vehiclePath(active.id, "add")}
            className="flex size-full max-w-16 flex-col items-center justify-center gap-0.5 rounded-[2px] bg-signal text-paper"
          >
            <PlusIcon className="size-[22px]" />
            <span className={LABEL}>Add</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

/** The vehicle slot, and the sheet it opens. */
function VehicleSheet() {
  const { vehicles, activeId, onVehiclePage } = useShell();
  const hrefFor = useVehicleHref();
  const active = vehicles.find((v) => v.id === activeId)!;
  const others = vehicles.filter((v) => v.id !== active.id);
  const othersAttention = others.reduce((a, v) => a + v.attention, 0);

  return (
    <Dialog.Root>
      <Dialog.Trigger
        className="flex min-w-0 items-center gap-2 border-t-2 border-transparent pl-4 pr-1 text-left"
        aria-label={`Vehicle: ${active.name}. Switch vehicle`}
      >
        <VehicleMark color={active.color} />
        <span className="min-w-0 flex-1">
          <span className={cn(LABEL, "flex items-center gap-1 text-ink-muted")}>
            Vehicle
            <ChevronUp className="size-3" />
            {othersAttention > 0 && <span className="size-1.5 rounded-full bg-signal" aria-hidden />}
          </span>
          <span className="mt-1 block truncate text-sm font-semibold">{active.name}</span>
        </span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="sheet-up pb-safe fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[4px] border-t border-rule bg-paper-raised">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule" aria-hidden />
          <div className="flex items-center justify-between px-4 pt-2">
            <Dialog.Title className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              Switch vehicle
            </Dialog.Title>
            <Dialog.Close className="-mr-2 inline-flex size-11 items-center justify-center" aria-label="Close">
              <CloseIcon className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Picking a vehicle opens the same page for it.
          </Dialog.Description>
          <ul className="border-t border-rule">
            {vehicles.map((v) => (
              <li key={v.id} className="border-b border-rule">
                <Dialog.Close asChild>
                  <Link href={hrefFor(v.id)} className="flex min-h-16 items-center gap-3 px-4 text-base">
                    <VehicleRowContent v={v} current={isCurrent(v, activeId, onVehiclePage) || (!onVehiclePage && v.id === active.id)} roomy />
                  </Link>
                </Dialog.Close>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-x-4 px-4 py-2 text-sm">
            <Dialog.Close asChild>
              <Link href={vehiclePath(active.id, "docs")} className="flex min-h-11 items-center text-ink-muted">
                {active.name} documents
              </Link>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Link href={vehiclePath(active.id, "settings")} className="flex min-h-11 items-center text-ink-muted">
                {active.name} settings
              </Link>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Link href="/" className="flex min-h-11 items-center text-ink-muted">All vehicles</Link>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Link href="/vehicles/new" className="flex min-h-11 items-center text-ink-muted">Add a vehicle</Link>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
