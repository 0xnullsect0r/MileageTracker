"use client";

import { useActionState, useState } from "react";
import {
  createVehicle,
  updateVehicle,
  type VehicleState,
} from "@/app/(app)/vehicles/actions";
import { VehicleMark } from "@/components/VehicleMark";
import { Button, Field, Label, Rule, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  type MeterType,
  type ReadingPrecision,
  allowedPrecisions,
  formatReading,
} from "@/lib/units";
import { VEHICLE_COLORS, VEHICLE_COLOR_LABEL, vehicleColor } from "@/lib/vehicle-colors";

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
  color: string;
  photoId: string | null;
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
  const [color, setColor] = useState(defaults.color);
  const [photoName, setPhotoName] = useState<string | null>(null);

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
      <fieldset>
        <legend className="block text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">Colour</legend>
        <p className="mt-1 text-sm text-ink-muted">Tells it apart in the vehicle switcher and on the garage page.</p>
        <input type="hidden" name="color" value={color} />
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {VEHICLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={VEHICLE_COLOR_LABEL[c]}
              title={VEHICLE_COLOR_LABEL[c]}
              onClick={() => setColor(color === c ? "" : c)}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-[2px] border",
                color === c ? "border-ink" : "border-transparent hover:border-rule",
              )}
            >
              <span className="size-6 rounded-[1px]" style={{ background: vehicleColor(c) }} />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <Label>Photo</Label>
        <div className="mt-2 flex items-center gap-4">
          {defaults.photoId && <VehicleMark color={color || null} photoId={defaults.photoId} size="lg" />}
          <label className="flex min-h-11 flex-1 cursor-pointer items-center border-b border-rule text-sm text-ink-muted hover:text-ink focus-within:border-signal">
            <span className="truncate">{photoName ?? (defaults.photoId ? "Replace photo" : "Choose a photo")}</span>
            <input type="file" name="photo" accept="image/*" className="sr-only" onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)} />
          </label>
        </div>
        {defaults.photoId && (
          <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-ink-muted">
            <input type="checkbox" name="removePhoto" className="size-5 accent-[var(--signal)]" />
            Remove the photo
          </label>
        )}
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
