import { asc, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminSettings, type CatRow, type RateRow } from "@/components/AdminSettings";
import { Rule } from "@/components/ui";
import { db } from "@/db";
import { categories, mileageRates } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const [rates, cats] = await Promise.all([
    db.select().from(mileageRates).orderBy(asc(mileageRates.year)),
    db.select().from(categories).where(isNull(categories.vehicleId)).orderBy(asc(categories.sortOrder)),
  ]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-6">
        <h1 className="text-[2rem] font-semibold tracking-tight">Settings</h1>
        <Link href="/admin/users" className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">
          Users
        </Link>
      </div>
      <Rule className="mt-6" />
      <div className="mt-8">
        <AdminSettings
          rates={rates.map((r): RateRow => ({ year: r.year, rateBusiness: r.rateBusiness }))}
          cats={cats
            .filter((c) => !c.isArchived)
            .map((c): CatRow => ({ id: c.id, code: c.code, name: c.name, kind: c.kind, isBusiness: c.isBusiness }))}
        />
      </div>
    </main>
  );
}
