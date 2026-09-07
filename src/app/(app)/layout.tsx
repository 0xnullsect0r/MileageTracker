import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The Proxy only checks that a cookie exists. This is the real check.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");

  return (
    <div className="min-h-dvh">
      <Nav user={user} />
      {children}
    </div>
  );
}
