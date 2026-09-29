"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { logout } from "@/app/(app)/actions";
import { cn } from "@/lib/cn";
import { useShell } from "./AppShell";
import { ChevronDown, CloseIcon, MenuIcon } from "./icons";
import { VehicleSwitcher } from "./VehicleSwitcher";

export interface ShellUser {
  name: string;
  role: "ADMIN" | "USER";
}

const TAP = "inline-flex min-h-11 items-center";

function useLinks(user: ShellUser): [string, string][] {
  return [
    ["/", "Garage"],
    ["/reports", "Reports"],
    ["/import", "Import"],
    ...(user.role === "ADMIN"
      ? ([
          ["/admin/users", "Users"],
          ["/admin/settings", "Settings"],
        ] as [string, string][])
      : []),
  ];
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const links = useLinks(user);

  return (
    <header className="sticky top-0 z-30 bg-paper">
      <div className="mx-auto flex min-h-14 max-w-[1400px] items-center gap-x-6 px-4 sm:px-8">
        <Link href="/" className={`${TAP} text-base font-semibold tracking-tight`}>
          Logbook
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-5 md:flex">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                TAP,
                "text-sm hover:text-ink",
                isActive(pathname, href) ? "font-semibold text-ink" : "text-ink-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-4 md:flex">
          <VehicleSwitcher />
          <UserMenu user={user} />
        </div>
        <div className="ml-auto md:hidden">
          <MobileMenu user={user} links={links} pathname={pathname} />
        </div>
      </div>
      <hr className="h-px border-0 bg-rule" aria-hidden />
    </header>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={form} action={logout} className="hidden" />
      <Menu.Root modal={false}>
        <Menu.Trigger className={`${TAP} gap-1 text-sm text-ink-muted hover:text-ink data-[state=open]:text-ink`}>
          {user.name}
          <ChevronDown className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={6} className="z-50 min-w-[12rem] rounded-[2px] border border-ink bg-paper-raised py-1">
            <Menu.Item asChild>
              <Link href="/account/password" className="flex min-h-11 items-center px-3 text-sm outline-none data-[highlighted]:bg-paper">
                Change password
              </Link>
            </Menu.Item>
            <Menu.Item
              onSelect={() => form.current?.requestSubmit()}
              className="flex min-h-11 cursor-default items-center px-3 text-sm outline-none data-[highlighted]:bg-paper"
            >
              Sign out
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}

function MobileMenu({ user, links, pathname }: { user: ShellUser; links: [string, string][]; pathname: string }) {
  const { vehicles } = useShell();
  const attention = vehicles.reduce((a, v) => a + v.attention, 0);
  const row = "flex min-h-12 items-center border-b border-rule text-base";

  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex size-11 items-center justify-center" aria-label="Menu">
        <MenuIcon />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fade-in fixed inset-x-0 top-0 z-50 max-h-dvh overflow-y-auto border-b border-rule bg-paper px-4 pb-6">
          <div className="flex min-h-14 items-center justify-between">
            <Dialog.Title className="text-base font-semibold tracking-tight">Logbook</Dialog.Title>
            <Dialog.Close className="inline-flex size-11 items-center justify-center" aria-label="Close menu">
              <CloseIcon />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Pages and account</Dialog.Description>
          <nav aria-label="Main" className="border-t border-rule">
            {links.map(([href, label]) => (
              <Dialog.Close key={href} asChild>
                <Link
                  href={href}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn(row, isActive(pathname, href) && "font-semibold")}
                >
                  <span className="flex-1">{label}</span>
                  {href === "/" && attention > 0 && (
                    <span className="num text-sm text-signal">{attention} due</span>
                  )}
                </Link>
              </Dialog.Close>
            ))}
          </nav>
          <div className="mt-6">
            <span className="block text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              {user.name}
            </span>
            <Dialog.Close asChild>
              <Link href="/account/password" className={cn(row, "text-ink-muted")}>Change password</Link>
            </Dialog.Close>
            <form action={logout}>
              <button type="submit" className={cn(row, "w-full text-left text-ink-muted")}>Sign out</button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
