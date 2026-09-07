import { notFound } from "next/navigation";
import { archiveVehicle } from "@/app/(app)/vehicles/actions";
import { VehicleForm } from "@/components/VehicleForm";
import { Button, Label, Rule } from "@/components/ui";
import { getVehicle } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function VehicleSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getVehicle(id);
  if (!v) notFound();

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">{v.name}</h1>
      <Rule className="mt-6 max-w-2xl" />
      <div className="mt-8">
        <VehicleForm
          defaults={{
            id: v.id,
            name: v.name,
            year: v.year?.toString() ?? "",
            make: v.make ?? "",
            model: v.model ?? "",
            plate: v.plate ?? "",
            meterType: v.meterType,
            distanceUnit: v.distanceUnit,
            readingPrecision: v.readingPrecision,
            fuelUnit: v.fuelUnit,
            tankCapacity: v.tankCapacity ?? "",
            notes: v.notes ?? "",
          }}
        />
      </div>

      <Rule className="my-10 max-w-2xl" />
      <Label>Archive</Label>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        Archiving hides the vehicle from the garage. Its entries are kept.
      </p>
      <form action={archiveVehicle} className="mt-4">
        <input type="hidden" name="id" value={v.id} />
        <Button type="submit" variant="danger">Archive this vehicle</Button>
      </form>
    </main>
  );
}
