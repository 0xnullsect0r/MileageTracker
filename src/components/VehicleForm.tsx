"use client";

import { useActionState, useState } from "react";
import {
  createVehicle,
  updateVehicle,
  type VehicleState,
} from "@/app/(app)/vehicles/actions";
import { Button, Field, Label, Rule, inputClass } from "@/components/ui";
import {
  type MeterType,
  type ReadingPrecision,
  allowedPrecisions,
  formatReading,
} from "@/lib/units";

const PRECISION_LABEL: Record<ReadingPrecision, string> = {
  WHOLE: "Whole",
  TENTHS: "Tenths",
  HOURS_MINUTES: "Hours and minutes",
};

export interface VehicleDefaults {
  id?: string;
  name: string;
  year: string;
  make: string;
  model: string;
  plate: string;
  meterType: MeterType;
  distanceUnit: "MI" | "KM";
  readingPrecision: ReadingPrecision;
  fuelUnit: string;
  tankCapacity: string;
  notes: string;
}

export function VehicleForm({ defaults }: { defaults: VehicleDefaults }) {
  const isEdit = defaults.id !== undefined;
  const [state, action, pending] = useActionState<VehicleState, FormData>(
    isEdit ? updateVehicle : createVehicle,
    {},
  );
  const [meterType, setMeterType] = useState<MeterType>(defaults.meterType);
  const [precision, setPrecision] = useState<ReadingPrecision>(defaults.readingPrecision);
  const [distanceUnit, setDistanceUnit] = useState(defaults.distanceUnit);

  const allowed = allowedPrecisions(meterType);
  const effective = allowed.includes(precision) ? precision : "WHOLE";

  // A worked sample, so the choice is legible before it is saved.
  const sampleTicks = meterType === "HOURS" ? 12625 : 1234560;
  const sample = formatReading(sampleTicks, {
    meterType,
    distanceUnit,
    readingPrecision: effective,
  });

  return (
    <form action={action} className="max-w-2xl">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <input className={inputClass} name="name" defaultValue={defaults.name} required placeholder="Marshal" />
        </Field>
        <Field label="Year"><input className={inputClass} name="year" inputMode="numeric" defaultValue={defaults.year} /></Field>
        <Field label="Make"><input className={inputClass} name="make" defaultValue={defaults.make} /></Field>
        <Field label="Model"><input className={inputClass} name="model" defaultValue={defaults.model} /></Field>
        <Field label="Plate"><input className={inputClass} name="plate" defaultValue={defaults.plate} /></Field>
      </div>

      <Rule className="my-8" />
      <Label>How this vehicle measures</Label>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <Field label="Meter">
          <select
            className={inputClass}
            name="meterType"
            value={meterType}
            onChange={(e) => setMeterType(e.target.value as MeterType)}
          >
            <option value="DISTANCE">Distance — car, truck, motorcycle</option>
            <option value="HOURS">Hours — tractor, dirt bike, generator</option>
          </select>
        </Field>

        {meterType === "DISTANCE" ? (
          <Field label="Unit">
            <select
              className={inputClass}
              name="distanceUnit"
              value={distanceUnit}
              onChange={(e) => setDistanceUnit(e.target.value as "MI" | "KM")}
            >
              <option value="MI">Miles</option>
              <option value="KM">Kilometres</option>
            </select>
          </Field>
        ) : (
          <input type="hidden" name="distanceUnit" value={distanceUnit} />
        )}

        <Field label="Detail">
          <select
            className={inputClass}
            name="readingPrecision"
            value={effective}
            onChange={(e) => setPrecision(e.target.value as ReadingPrecision)}
          >
            {allowed.map((p) => (
              <option key={p} value={p}>{PRECISION_LABEL[p]}</option>
            ))}
          </select>
        </Field>

        <div>
          <Label>Reads as</Label>
          <p className="num mt-1 text-[1.5rem]">{sample}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Detail changes how readings are shown and typed. Nothing already recorded is altered.
          </p>
        </div>
      </div>

      <Rule className="my-8" />
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Fuel measured in">
          <select className={inputClass} name="fuelUnit" defaultValue={defaults.fuelUnit}>
            <option value="GAL_US">US gallons</option>
            <option value="GAL_IMP">Imperial gallons</option>
            <option value="L">Litres</option>
            <option value="KWH">Kilowatt-hours</option>
          </select>
        </Field>
        <Field label="Tank capacity" hint="Used to spot an impossible fill-up on import.">
          <input className={inputClass} name="tankCapacity" inputMode="decimal" defaultValue={defaults.tankCapacity} placeholder="12.4" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <input className={inputClass} name="notes" defaultValue={defaults.notes} />
        </Field>
      </div>

      {state.error && (
        <p className="mt-6 text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>
      )}
      <Button type="submit" variant="primary" disabled={pending} className="mt-8">
        {pending ? "Saving…" : isEdit ? "Save changes" : "Add vehicle"}
      </Button>
    </form>
  );
}
