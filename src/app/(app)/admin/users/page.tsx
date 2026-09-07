import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminUsers, type AdminUserRow } from "@/components/AdminUsers";
import { Rule } from "@/components/ui";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // Re-checked here, not just in the Proxy.
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  const list: AdminUserRow[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    mustChangePassword: u.mustChangePassword,
    isSelf: u.id === me.id,
  }));

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">Users</h1>
      <Rule className="mt-6" />
      <div className="mt-8">
        <AdminUsers rows={list} />
      </div>
    </main>
  );
}
