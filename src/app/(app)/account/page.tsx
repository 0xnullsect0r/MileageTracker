import Link from "next/link";
import { setTextSize } from "@/app/(app)/account/actions";
import { Label, Rule } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const SIZES = [
  { value: "standard", name: "Standard", px: 24, note: "The log fits more rows on a screen." },
  {
    value: "large",
    name: "Large",
    px: 30,
    note: "A quarter larger throughout — type, buttons and the log — with darker secondary text.",
  },
] as const;

export default async function AccountPage() {
  const user = await requireUser();
  const current = user.largeText ? "large" : "standard";

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-12">
      <h1 className="text-[2rem] font-semibold tracking-tight">Your account</h1>
      <p className="mt-1 text-ink-muted">
        {user.name} · {user.email}
      </p>
      <Rule className="mt-6 max-w-2xl" />

      <section aria-labelledby="text-size" className="mt-8 max-w-2xl">
        <h2 id="text-size" className="text-[1.25rem] font-semibold tracking-tight">Text size</h2>
        <p className="mt-1 text-sm text-ink-muted">
          For you on every device you sign in on. Nobody else&rsquo;s view changes.
        </p>

        {/* Two submit buttons, one form: works before the page's script has
            loaded, and the choice takes effect on the spot. */}
        <form action={setTextSize} className="mt-4 grid gap-3 sm:grid-cols-2">
          {SIZES.map((s) => {
            const on = s.value === current;
            return (
              <button
                key={s.value}
                type="submit"
                name="size"
                value={s.value}
                aria-pressed={on}
                className={cn(
                  "flex min-h-11 flex-col items-start border px-4 py-4 text-left transition-colors duration-100",
                  on ? "border-ink border-l-[3px] border-l-signal" : "border-rule hover:border-ink",
                )}
              >
                <Label className={on ? "text-ink" : undefined}>{on ? `${s.name} · in use` : s.name}</Label>
                {/* In pixels, not rem: each sample shows its own size whichever
                    one is in use, so you choose by eye. */}
                <span className="num mt-2 leading-tight" style={{ fontSize: s.px }}>
                  78,441 mi
                </span>
                <span className="mt-2 text-sm text-ink-muted">{s.note}</span>
              </button>
            );
          })}
        </form>
      </section>

      <Rule className="mt-10 max-w-2xl" />
      <section className="mt-8 max-w-2xl">
        <h2 className="text-[1.25rem] font-semibold tracking-tight">Password</h2>
        <Link href="/account/password" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:text-signal">
          Change password
        </Link>
      </section>
    </main>
  );
}
