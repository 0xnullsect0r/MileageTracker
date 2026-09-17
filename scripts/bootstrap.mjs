/**
 * First-boot bootstrap: create the initial admin and seed the reference data
 * that the app is useless without (categories, IRS mileage rates).
 *
 * Idempotent — safe to run on every container start.
 */
import { hash } from "@node-rs/argon2";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const nodeEnv = process.env.NODE_ENV ?? "development";
const sessionSecret = process.env.SESSION_SECRET ?? "";

if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// The three defaults from .env.example. Booting production with any of
// them still in place is a public-facing failure waiting to happen.
const DEFAULTS = new Set(["change-me", "change-me-too", "you@example.com"]);
if (nodeEnv === "production") {
  const violations = [];
  if (DEFAULTS.has(password)) violations.push("ADMIN_PASSWORD is the .env.example default");
  if (DEFAULTS.has(email)) violations.push("ADMIN_EMAIL is the .env.example default");
  if (DEFAULTS.has(sessionSecret) || sessionSecret.length < 32) {
    violations.push("SESSION_SECRET is missing or too short (need 32+ chars; run `openssl rand -base64 48`)");
  }
  if (violations.length > 0) {
    console.error("bootstrap: refusing to start with insecure defaults:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error("Edit .env and restart. See README#Configuration.");
    process.exit(1);
  }
}

const sql = postgres(url, { max: 1 });

try {
  if (email && password) {
    const existing = await sql`select id from users where email = ${email} limit 1`;
    if (existing.length === 0) {
      const anyAdmin = await sql`select id from users where role = 'ADMIN' limit 1`;
      const passwordHash = await hash(password);
      await sql`
        insert into users (email, name, password_hash, role, must_change_password)
        values (${email}, ${"Administrator"}, ${passwordHash}, 'ADMIN', true)
      `;
      console.log(
        anyAdmin.length === 0
          ? `bootstrap: created admin ${email} (must change password at first sign-in)`
          : `bootstrap: added admin ${email}`,
      );
    }
  }

  // Global categories, seeded from the spreadsheet's own key.
  const seeded = [
    ["B", "Business", "TRIP", true, 1],
    ["P", "Personal", "TRIP", false, 2],
    ["G", "Gas", "FUEL", false, 3],
    ["S", "Service", "SERVICE", false, 4],
    ["I", "Info", "NOTE", false, 5],
  ];
  for (const [code, name, kind, isBusiness, sortOrder] of seeded) {
    await sql`
      insert into categories (vehicle_id, code, name, kind, is_business, sort_order)
      select null, ${code}, ${name}, ${kind}::category_kind, ${isBusiness}, ${sortOrder}
      where not exists (
        select 1 from categories where vehicle_id is null and code = ${code}
      )
    `;
  }

  // Published IRS standard mileage rates, business/medical/charity.
  const rates = [
    [2016, 0.54, 0.19, 0.14],
    [2017, 0.535, 0.17, 0.14],
    [2018, 0.545, 0.18, 0.14],
    [2019, 0.58, 0.2, 0.14],
    [2020, 0.575, 0.17, 0.14],
    [2021, 0.56, 0.16, 0.14],
    [2022, 0.625, 0.22, 0.14],
    [2023, 0.655, 0.22, 0.14],
    [2024, 0.67, 0.21, 0.14],
    [2025, 0.7, 0.21, 0.14],
    [2026, 0.7, 0.21, 0.14],
  ];
  for (const [year, business, medical, charity] of rates) {
    await sql`
      insert into mileage_rates (year, rate_business, rate_medical, rate_charity)
      values (${year}, ${business}, ${medical}, ${charity})
      on conflict (year) do nothing
    `;
  }

  console.log("bootstrap: reference data in place");
} finally {
  await sql.end();
}
