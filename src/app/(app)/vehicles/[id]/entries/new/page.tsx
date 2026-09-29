import { notFound } from "next/navigation";
import { QuickEntry } from "@/components/QuickEntry";
import { getVehicle, latestReadingTicks, listCategories, loadReminders, todayIso, unitsOf } from "@/lib/data";
import { reminderOptions } from "@/lib/entry-form";

export const dynamic = "force-dynamic";

export default async function NewEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const units = unitsOf(vehicle);
  const today = todayIso();
  const [cats, last, reminders] = await Promise.all([listCategories(id), latestReadingTicks(id), loadReminders(id)]);

  return (
    // The one screen where a single centred column is right: it is a single
    // timed task, done one-handed, standing at a pump.
    <main className="px-4 pb-10 pt-2 sm:px-8">
      <QuickEntry
        vehicleId={id}
        vehicleName={vehicle.name}
        units={units}
        categories={cats.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind }))}
        lastReadingTicks={last}
        today={today}
        reminders={reminderOptions(reminders, last, today, units)}
      />
    </main>
  );
}
