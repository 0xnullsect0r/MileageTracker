/** The whole import wizard, driven against the real .numbers file. */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3311";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', process.env.ADMIN_EMAIL ?? "admin@example.com");
await page.fill('input[name="password"]', process.env.E2E_PASSWORD ?? "dev-password-123");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 20000 });

page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 300)); });
page.on("response", (r) => { if (r.status() >= 400) console.log("[http]", r.status(), r.url().slice(0, 120)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto(`${BASE}/import`, { waitUntil: "networkidle" });
console.log("on import page, buttons:", await page.locator("button[type=submit]").count());
await page.setInputFiles('input[type="file"]', "Car Log - Marshal.numbers");
// Target the upload button by name: the nav's "Sign out" is also a submit
// button and sits earlier in the DOM.
await page.click('button:has-text("Read the file")');
await page.waitForURL(/\/import\/[0-9a-f-]{36}$/, { timeout: 120000 });
console.log("parsed and landed on review:", new URL(page.url()).pathname);

await page.waitForSelector("text=Check before importing");
const stat = async (label) => {
  const el = page.locator(`text=${label}`).first();
  return (await el.locator("xpath=following-sibling::*[1]").innerText()).trim();
};
console.log("rows read:", await stat("Rows read"));
console.log("blank dropped:", await stat("Blank, dropped"));
console.log("needs a decision:", await stat("Needs a decision"));

// The flagship case must be visible, with its one suggestion.
const body = await page.locator("main").innerText();
if (!body.includes("566,698")) fail("the 566,698 typo is not shown on the review screen");
if (!body.includes("56,698")) fail("the 56,698 correction is not offered");
if (!body.includes("14.0277")) fail("the 14.0277 fuel correction is not offered");
console.log("flagship outliers present with suggestions");

await page.screenshot({ path: "review-screenshots/import-review-1440.png", fullPage: false });

await page.click("text=/Accept the \\d+ unambiguous/");
await page.waitForTimeout(1500);
console.log("accepted the unambiguous corrections");
await page.screenshot({ path: "review-screenshots/import-review-accepted-1440.png" });

await page.click('button:has-text("Import into Marshal")');
await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}\/entries$/, { timeout: 120000 });
console.log("committed, landed on:", new URL(page.url()).pathname);

await page.waitForSelector("text=of 3,");
const count = await page.locator("text=/of 3,\\d{3}/").first().innerText();
console.log("log shows:", count.trim());
await page.screenshot({ path: "review-screenshots/entries-after-import-1440.png" });

await browser.close();
