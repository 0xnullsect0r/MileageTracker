import { notFound } from "next/navigation";
import { VehicleHeader } from "@/components/nav/VehicleHeader";
import { getVehicle, latestReadingTicks, unitsOf } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Every vehicle page shares one header: name, reading, and its tabs. */
export default async function VehicleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();
  const current = await latestReadingTicks(id);

  const subtitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");

  return (
    <>
      <VehicleHeader
        id={vehicle.id}
        name={vehicle.name}
        subtitle={subtitle || null}
        color={vehicle.color}
        photoId={vehicle.photoAttachmentId}
        readingTicks={current}
        units={unitsOf(vehicle)}
      />
      {children}
    </>
  );
}
