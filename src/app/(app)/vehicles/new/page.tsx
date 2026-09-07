import { VehicleForm } from "@/components/VehicleForm";
import { Rule } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function NewVehiclePage() {
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
          }}
        />
      </div>
    </main>
  );
}
