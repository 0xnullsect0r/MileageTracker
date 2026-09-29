import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/nav/AppShell";
import { getSessionUser } from "@/lib/auth";
import { listVehicleSummaries } from "@/lib/data";
import { COOKIE_TAB, COOKIE_VEHICLE } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The Proxy only checks that a cookie exists. This is the real check.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");

  const [vehicles, jar] = await Promise.all([listVehicleSummaries(), cookies()]);

  return (
    <div className="min-h-dvh">
      <Suspense>
        <AppShell
          user={{ name: user.name, role: user.role }}
          vehicles={vehicles}
          initialVehicleId={jar.get(COOKIE_VEHICLE)?.value ?? null}
          initialTab={jar.get(COOKIE_TAB)?.value ?? null}
        >
          {children}
        </AppShell>
      </Suspense>
    </div>
  );
}
