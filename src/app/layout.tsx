import type { Metadata, Viewport } from "next";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Logbook",
  description: "Mileage, fuel and service log.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Logbook", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#15171a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Large text is a person's setting, so it is applied on the server before
  // the first paint — no flash of small type. Signed out, or with the
  // database unreachable, the page simply renders at the standard size.
  const user = await getSessionUser().catch(() => null);
  return (
    <html lang="en" data-text={user?.largeText ? "large" : undefined}>
      <body>{children}</body>
    </html>
  );
}
