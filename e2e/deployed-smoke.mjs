/**
 * Smoke test against the deployed compose stack, using only what a real
 * first-run user has: the ADMIN_EMAIL / ADMIN_PASSWORD from .env.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// Reads the same values the stack was started with, so this works against
// anyone's deployment rather than only the one it was written on.
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const FIRST_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me-too";
const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD ?? "smoke-test-password-1";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"}  ${msg}`); if (!ok) failures++; };

// 1. First sign-in forces a password change.
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', FIRST_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/account\/password/, { timeout: 30000 });
check(true, "first sign-in is forced to set a password");

await page.fill('input[name="current"]', FIRST_PASSWORD);
await page.fill('input[name="next"]', NEW_PASSWORD);
await page.fill('input[name="confirm"]', NEW_PASSWORD);
await page.click('button:has-text("Change password")');
await page.waitForURL(`${BASE}/`, { timeout: 30000 });
check(true, "password changed and landed on the garage");

// 2. Add a vehicle in hours mode, at hours-and-minutes precision.
await page.goto(`${BASE}/vehicles/new`);
await page.fill('input[name="name"]', "Kubota");
await page.selectOption('select[name="meterType"]', "HOURS");
await page.selectOption('select[name="readingPrecision"]', "HOURS_MINUTES");
const sample = await page.locator("text=Reads as").locator("xpath=following-sibling::*[1]").innerText();
check(sample.trim() === "210:25", `units preview shows hours and minutes (got "${sample.trim()}")`);
await page.click('button:has-text("Add vehicle")');
await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}\/entries$/, { timeout: 30000 });
const vehicleId = page.url().match(/vehicles\/([0-9a-f-]{36})/)[1];

// 3. Two readings on the hour meter, and the delta must render as h:mm.
for (const [reading, desc] of [["210:25", "Mowing"], ["213:10", "Baling"]]) {
  await page.goto(`${BASE}/vehicles/${vehicleId}/entries/new`);
  await page.fill('input[name="reading"]', reading);
  await page.fill('input[name="description"]', desc);
  await page.click('button:has-text("Save entry")');
  await page.waitForURL(/\/entries$/, { timeout: 30000 });
}
let body = await page.locator("main").innerText();
check(body.includes("213:10"), "hour-meter reading stored and shown as h:mm");
check(body.includes("+2:45"), "delta between hour readings renders as +2:45");

// 4. Switching precision must not touch the stored values.
await page.goto(`${BASE}/vehicles/${vehicleId}/settings`);
await page.selectOption('select[name="readingPrecision"]', "WHOLE");
await page.click('button:has-text("Save changes")');
await page.waitForURL(/\/entries$/, { timeout: 30000 });
body = await page.locator("main").innerText();
check(body.includes("213") && !body.includes("213:10"), "whole-hours display after the switch");

await page.goto(`${BASE}/vehicles/${vehicleId}/settings`);
await page.selectOption('select[name="readingPrecision"]', "HOURS_MINUTES");
await page.click('button:has-text("Save changes")');
await page.waitForURL(/\/entries$/, { timeout: 30000 });
body = await page.locator("main").innerText();
check(body.includes("213:10"), "switching back restores 213:10 — the stored value never changed");

// 5. Admin creates a user; that user's session dies when the password is reset.
await page.goto(`${BASE}/admin/users`);
await page.fill('input[name="name"]', "Second Person");
await page.fill('input[name="email"]', "second@example.com");
await page.fill('form input[name="password"]', "temporary-password-1");
await page.click('button:has-text("Add user")');
await page.waitForTimeout(2000);
check((await page.locator("main").innerText()).includes("second@example.com"), "admin created a user");

const other = await browser.newContext();
const otherPage = await other.newPage();
await otherPage.goto(`${BASE}/login`);
await otherPage.fill('input[name="email"]', "second@example.com");
await otherPage.fill('input[name="password"]', "temporary-password-1");
await otherPage.click('button[type="submit"]');
await otherPage.waitForURL(/account\/password/, { timeout: 30000 });
check(true, "new user signs in and is asked to set a password");

await page.goto(`${BASE}/admin/users`);
const row = page.locator('tr:has-text("second@example.com")');
await row.getByRole("button", { name: "Reset password" }).click();
await row.locator('input[type="password"]').fill("another-password-2");
// Exact: has-text is a case-insensitive substring, so "Set" also matches
// "Reset password" and the click never lands.
await row.getByRole("button", { name: "Set", exact: true }).click();
await page.waitForTimeout(2500);

await otherPage.goto(`${BASE}/`);
check(/\/login/.test(otherPage.url()), "the other session was revoked the moment the password changed");

// 6. A non-admin may not reach the admin page.
await otherPage.goto(`${BASE}/login`);
await otherPage.fill('input[name="email"]', "second@example.com");
await otherPage.fill('input[name="password"]', "another-password-2");
await otherPage.click('button[type="submit"]');
await otherPage.waitForURL(/account\/password/, { timeout: 30000 });
await otherPage.fill('input[name="current"]', "another-password-2");
await otherPage.fill('input[name="next"]', "third-password-3xyz");
await otherPage.fill('input[name="confirm"]', "third-password-3xyz");
await otherPage.click('button:has-text("Change password")');
await otherPage.waitForURL(`${BASE}/`, { timeout: 30000 });
await otherPage.goto(`${BASE}/admin/users`);
check(!/admin\/users/.test(otherPage.url()), "a non-admin is turned away from /admin/users");

await browser.close();
console.log(failures === 0 ? "\nall deployed checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
