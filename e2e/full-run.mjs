/**
 * Set up the deployed stack the way a real first run goes — change the
 * password, create the vehicle, import the actual spreadsheet — then
 * screenshot every screen at the four review widths.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const FIRST = process.env.ADMIN_PASSWORD ?? "change-me-too";
const PASSWORD = process.env.E2E_NEW_PASSWORD ?? "review-password-1234";
const WIDTHS = [375, 768, 1024, 1440];

mkdirSync("review-screenshots", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', FIRST);
await page.click('button[type="submit"]');
await page.waitForURL(/account\/password/, { timeout: 30000 });
await page.fill('input[name="current"]', FIRST);
await page.fill('input[name="next"]', PASSWORD);
await page.fill('input[name="confirm"]', PASSWORD);
await page.click('button:has-text("Change password")');
await page.waitForURL(`${BASE}/`, { timeout: 30000 });

await page.goto(`${BASE}/vehicles/new`);
await page.fill('input[name="name"]', "Marshal");
await page.fill('input[name="year"]', "2016");
await page.fill('input[name="make"]', "Honda");
await page.fill('input[name="model"]', "Civic");
await page.fill('input[name="tankCapacity"]', "12.4");
await page.click('button:has-text("Add vehicle")');
await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}\/entries$/, { timeout: 30000 });
const vehicleId = page.url().match(/vehicles\/([0-9a-f-]{36})/)[1];

await page.goto(`${BASE}/import`);
await page.setInputFiles('input[type="file"]', "Car Log - Marshal.numbers");
await page.click('button:has-text("Read the file")');
await page.waitForURL(/\/import\/[0-9a-f-]{36}$/, { timeout: 180000 });
await page.screenshot({ path: "review-screenshots/import-review-1440.png" });
await page.click("text=/Accept the \\d+ unambiguous/");
await page.waitForTimeout(1500);
await page.click('button:has-text("Import into Marshal")');
await page.waitForURL(/\/entries$/, { timeout: 180000 });
console.log("imported into the deployed stack");
await ctx.close();

const routes = [
  ["dashboard", "/"],
  ["entries", `/vehicles/${vehicleId}/entries`],
  ["quick-entry", `/vehicles/${vehicleId}/entries/new`],
  ["fuel", `/vehicles/${vehicleId}/fuel`],
  ["service", `/vehicles/${vehicleId}/service`],
  ["reports", "/reports"],
  ["import", "/import"],
  ["admin", "/admin/users"],
  ["settings", `/vehicles/${vehicleId}/settings`],
  ["styleguide", "/styleguide"],
];

for (const width of WIDTHS) {
  const c = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', EMAIL);
  await p.fill('input[name="password"]', PASSWORD);
  await p.click('button[type="submit"]');
  await p.waitForURL(`${BASE}/`, { timeout: 30000 });

  await p.goto(`${BASE}/login`).catch(() => {});
  const problems = [];
  for (const [name, path] of routes) {
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(350);
    await p.screenshot({ path: `review-screenshots/${name}-${width}.png` });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    if (overflow) problems.push(name);
    const small = await p.evaluate(() => {
      // Tap targets and text size, per the brief.
      let tiny = 0;
      for (const el of document.querySelectorAll("button, a, input, select")) {
        const r = el.getBoundingClientRect();
        // A checkbox is 16px by nature; its label is the tap target, so
        // measure the label when there is one.
        const target = el.closest("label") ?? el;
        const tr = target.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && tr.height < 44) tiny++;
      }
      return tiny;
    });
    if (width === 375 && small > 0) problems.push(`${name}:${small} targets under 44px`);
  }
  console.log(`${width}: ${problems.length === 0 ? "clean" : problems.join(", ")}`);
  await c.close();
}

await browser.close();
console.log("screenshots written");
