"use client";

import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { DueBadge, VehicleMark } from "@/components/VehicleMark";
import { useShell } from "./AppShell";
import { ChevronDown } from "./icons";
import { VehicleRowContent, isCurrent, useVehicleHref } from "./VehicleList";

const ITEM =
  "flex min-h-11 cursor-default items-center gap-3 px-3 text-sm outline-none select-none data-[highlighted]:bg-paper";

/** The desktop switcher: a dropdown in the top bar. */
export function VehicleSwitcher() {
  const { vehicles, activeId, onVehiclePage } = useShell();
  const hrefFor = useVehicleHref();
  const active = onVehiclePage ? vehicles.find((v) => v.id === activeId) ?? null : null;
  const fleetAttention = vehicles.reduce((a, v) => a + v.attention, 0);
  const fleetOverdue = vehicles.reduce((a, v) => a + v.overdue, 0);

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="inline-flex min-h-11 max-w-[18rem] items-center gap-2 rounded-[2px] border border-rule px-3 text-sm hover:border-ink data-[state=open]:border-ink">
        {active ? (
          <>
            <VehicleMark color={active.color} />
            <span className="truncate font-semibold">{active.name}</span>
            <DueBadge count={active.attention} overdue={active.overdue} />
          </>
        ) : (
          <>
            <span className="truncate text-ink-muted">{vehicles.length === 0 ? "No vehicles" : "All vehicles"}</span>
            <DueBadge count={fleetAttention} overdue={fleetOverdue} />
          </>
        )}
        <ChevronDown className="size-4 shrink-0 text-ink-muted" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[2px] border border-ink bg-paper-raised py-1"
        >
          <Menu.Label className="px-3 pb-1 pt-2 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Switch vehicle
          </Menu.Label>
          {vehicles.map((v) => (
            <Menu.Item key={v.id} asChild>
              <Link href={hrefFor(v.id)} className={ITEM}>
                <VehicleRowContent v={v} current={isCurrent(v, activeId, onVehiclePage)} />
              </Link>
            </Menu.Item>
          ))}
          <Menu.Separator className="my-1 h-px bg-rule" />
          <Menu.Item asChild>
            <Link href="/" className={`${ITEM} text-ink-muted`}>All vehicles</Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link href="/vehicles/new" className={`${ITEM} text-ink-muted`}>Add a vehicle</Link>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
