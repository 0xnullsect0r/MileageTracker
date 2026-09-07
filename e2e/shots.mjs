/** Log in, then capture the review screenshots at the four widths. */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3311";
const EMAIL = process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "change-me-too";
const WIDTHS = [375, 768, 1024, 1440];

mkdirSync("review-screenshots", { recursive: true });
const browser = await chromium.launch();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `review-screenshots/login-${width}.png`, fullPage: false });

  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(account\/password)?$/, { timeout: 20000 });

  if (page.url().includes("/account/password")) {
    await page.screenshot({ path: `review-screenshots/password-${width}.png` });
    console.log(`${width}: forced password change (expected on a fresh admin)`);
    await ctx.close();
    continue;
  }

  const vehicleHref = await page.getAttribute('a[href*="/entries"]', "href");
  const vehicleId = vehicleHref?.match(/vehicles\/([^/]+)/)?.[1];

  for (const [name, path] of [
    ["dashboard", "/"],
    ["styleguide", "/styleguide"],
    ...(vehicleId ? [["entries", `/vehicles/${vehicleId}/entries`]] : []),
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `review-screenshots/${name}-${width}.png` });
  }

  // Horizontal overflow is a hard failure of the design brief.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  console.log(`${width}: ${overflow ? "HORIZONTAL OVERFLOW" : "no horizontal scroll"}`);
  await ctx.close();
}

await browser.close();
console.log("screenshots written to review-screenshots/");
