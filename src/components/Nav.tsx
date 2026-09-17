import Link from "next/link";
import { logout } from "@/app/(app)/actions";
import { Rule } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";

/** Navigation is thumb-work on a phone, so every item clears 44px. */
const TAP = "inline-flex min-h-11 items-center";

export function Nav({ user }: { user: SessionUser }) {
  const links: [string, string][] = [
    ["/", "Garage"],
    ["/reports", "Reports"],
    ["/import", "Import"],
  ];

  return (
    <header>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
        <Link href="/" className={`${TAP} text-base font-semibold tracking-tight`}>
          Logbook
        </Link>
        <nav className="flex items-center gap-5">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={`${TAP} text-sm text-ink-muted hover:text-ink`}>
              {label}
            </Link>
          ))}
          {user.role === "ADMIN" && (
            <>
              <Link href="/admin/users" className={`${TAP} text-sm text-ink-muted hover:text-ink`}>
                Users
              </Link>
              <Link href="/admin/settings" className={`${TAP} text-sm text-ink-muted hover:text-ink`}>
                Settings
              </Link>
              <Link href="/admin/audit" className={`${TAP} text-sm text-ink-muted hover:text-ink`}>
                Audit
              </Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <Link href="/account/password" className={`${TAP} text-sm text-ink-muted hover:text-ink`}>
            {user.name}
          </Link>
          <form action={logout}>
            <button type="submit" className={`${TAP} text-sm text-ink-muted hover:text-ink`}>
              Sign out
            </button>
          </form>
        </div>
      </div>
      <Rule />
    </header>
  );
}
