import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { Reading } from "@/components/Reading";
import { Rule } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import type { VehicleUnits } from "@/lib/units";
import { getMasthead } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSessionUser()) redirect("/");

  const { next = "/" } = await searchParams;
  const masthead = await getMasthead();
  const units: VehicleUnits | null = masthead
    ? {
        meterType: masthead.meterType,
        distanceUnit: masthead.distanceUnit,
        readingPrecision: masthead.readingPrecision,
      }
    : null;

  return (
    // Asymmetric: the log on the left, the form on the right. No centred
    // card, and nothing that reads as marketing.
    <main className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
      <section>
        {masthead && units && masthead.readingTicks !== null ? (
          <>
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              {masthead.vehicleName}
            </p>
            {/* The wordmark is the reading. It is what the product is. */}
            <div className="mt-2">
              <Reading ticks={masthead.readingTicks} units={units} size="hero" withUnit />
            </div>
            <Rule className="mt-6 max-w-md" />
            <p className="mt-4 text-ink-muted">
              <span className="num">{masthead.entryCount.toLocaleString("en-US")}</span> entries
              {masthead.since && (
                <>
                  {" "}
                  since{" "}
                  <span className="num">
                    {new Date(`${masthead.since}T00:00:00`).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[2.5rem] font-semibold leading-none tracking-tight">Logbook</h1>
            <Rule className="mt-6 max-w-md" />
            <p className="mt-4 text-ink-muted">Mileage, fuel and service.</p>
          </>
        )}
      </section>

      <section className="lg:justify-self-end">
        <LoginForm next={next} />
      </section>
    </main>
  );
}
