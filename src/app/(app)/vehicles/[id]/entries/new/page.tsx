import { notFound } from "next/navigation";
import { QuickEntry } from "@/components/QuickEntry";
import { getVehicle, latestReadingTicks, listCategories, unitsOf } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const [cats, last] = await Promise.all([listCategories(id), latestReadingTicks(id)]);

  return (
    // The one screen where a single centred column is right: it is a single
    // timed task, done one-handed, standing at a pump.
    <main className="px-4 py-8 sm:px-8">
      <QuickEntry
        vehicleId={id}
        vehicleName={vehicle.name}
        units={unitsOf(vehicle)}
        categories={cats.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind }))}
        lastReadingTicks={last}
        today={new Date().toISOString().slice(0, 10)}
      />
    </main>
  );
}
