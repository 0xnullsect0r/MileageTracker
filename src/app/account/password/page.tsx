import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/PasswordForm";
import { Banner, Rule } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-12 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">Password</h1>
      <Rule className="mt-6 max-w-2xl" />
      {user.mustChangePassword && (
        <div className="mt-6 max-w-2xl">
          <Banner>
            This account still has the password it was created with. Choose your own before
            going on.
          </Banner>
        </div>
      )}
      <p className="mt-6 max-w-prose text-sm text-ink-muted">
        Changing your password signs out every other device immediately.
      </p>
      <div className="mt-8">
        <PasswordForm />
      </div>
    </main>
  );
}
