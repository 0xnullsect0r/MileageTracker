import { redirect } from "next/navigation";
import { signOutEverywhere } from "@/app/(app)/actions";
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

      <section className="mt-16 max-w-2xl border-t border-rule pt-8">
        <h2 className="text-lg font-semibold tracking-tight">Sign out everywhere</h2>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          Ends every session on this account, including this one. Use it when a personal
          device is lost.
        </p>
        <form action={signOutEverywhere} className="mt-4">
          <button
            type="submit"
            className="min-h-11 border border-rule px-4 text-sm font-semibold text-ink-muted hover:border-signal hover:text-signal"
          >
            Sign out everywhere
          </button>
        </form>
      </section>
    </main>
  );
}
