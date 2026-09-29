import { VehicleForm } from "@/components/VehicleForm";
import { Rule } from "@/components/ui";
import { listVehicles } from "@/lib/data";
import { VEHICLE_COLORS } from "@/lib/vehicle-colors";

export const dynamic = "force-dynamic";

export default async function NewVehiclePage() {
  // Start from a colour no other vehicle is using, so the switcher stays legible.
  const used = new Set((await listVehicles()).map((v) => v.color));
  const color = VEHICLE_COLORS.find((c) => !used.has(c)) ?? "";

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">Add a vehicle</h1>
      <Rule className="mt-6 max-w-2xl" />
      <div className="mt-8">
        <VehicleForm
          defaults={{
            name: "",
            year: "",
            make: "",
            model: "",
            plate: "",
            meterType: "DISTANCE",
            distanceUnit: "MI",
            readingPrecision: "WHOLE",
            fuelUnit: "GAL_US",
            tankCapacity: "",
            notes: "",
            color,
            photoId: null,
          }}
        />
      </div>
    </main>
  );
}
