import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMIN", "USER"]);
export const meterTypeEnum = pgEnum("meter_type", ["DISTANCE", "HOURS"]);
export const distanceUnitEnum = pgEnum("distance_unit", ["MI", "KM"]);
export const readingPrecisionEnum = pgEnum("reading_precision", [
  "WHOLE",
  "TENTHS",
  "HOURS_MINUTES",
]);
export const fuelUnitEnum = pgEnum("fuel_unit", ["GAL_US", "GAL_IMP", "L", "KWH"]);
export const categoryKindEnum = pgEnum("category_kind", ["TRIP", "FUEL", "SERVICE", "NOTE"]);
export const importStatusEnum = pgEnum("import_status", ["DRAFT", "COMMITTED", "REVERTED"]);

/* ------------------------------------------------------------------ auth */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(), // stored lowercase; see lib/auth
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("USER"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

/**
 * `id` is the SHA-256 of the cookie token, never the token itself — a
 * database leak must not hand out live sessions. Deleting a user or changing
 * a password deletes these rows, which is what makes revocation instant.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------- vehicles */

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  vin: text("vin"),
  plate: text("plate"),
  color: text("color"),

  meterType: meterTypeEnum("meter_type").notNull().default("DISTANCE"),
  distanceUnit: distanceUnitEnum("distance_unit").notNull().default("MI"),
  readingPrecision: readingPrecisionEnum("reading_precision").notNull().default("WHOLE"),

  fuelUnit: fuelUnitEnum("fuel_unit").notNull().default("GAL_US"),
  fuelType: text("fuel_type"),
  tankCapacity: numeric("tank_capacity", { precision: 9, scale: 3 }),

  purchaseDate: date("purchase_date"),
  purchaseReadingTicks: bigint("purchase_reading_ticks", { mode: "number" }),

  /** Anomaly ceiling for a single hop, in ticks. Null = derive from history. */
  maxPlausibleDeltaTicks: bigint("max_plausible_delta_ticks", { mode: "number" }),

  isActive: boolean("is_active").notNull().default(true),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `kind` drives behaviour (which fields show, which maths apply).
 * `isBusiness` drives the deduction report INDEPENDENTLY of kind, so a
 * business fuel stop still counts toward business distance.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull().default("TRIP"),
    isBusiness: boolean("is_business").notNull().default(false),
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_vehicle_idx").on(t.vehicleId)],
);

/* --------------------------------------------------------------- entries */

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  status: importStatusEnum("status").notNull().default("DRAFT"),
  stats: jsonb("stats"),
  /** The parsed spreadsheet, held between wizard steps. Cleared on commit. */
  draftDocument: jsonb("draft_document"),
  /** Decisions taken so far in the outlier review. */
  draftDecisions: jsonb("draft_decisions"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  revertedAt: timestamp("reverted_at", { withTimezone: true }),
});

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),

    occurredOn: date("occurred_on").notNull(),
    /** Exact integer. See lib/units — 100/mile or 60/hour. Null for pure notes. */
    readingTicks: bigint("reading_ticks", { mode: "number" }),

    description: text("description"),
    notes: text("notes"),
    vendor: text("vendor"),

    fuelQty: numeric("fuel_qty", { precision: 9, scale: 3 }),
    fuelPricePerUnit: numeric("fuel_price_per_unit", { precision: 9, scale: 4 }),
    cost: numeric("cost", { precision: 10, scale: 2 }),

    isPartialFill: boolean("is_partial_fill").notNull().default(false),
    isMissedFill: boolean("is_missed_fill").notNull().default(false),
    /** Breaks the delta chain rather than producing a garbage negative. */
    odometerReset: boolean("odometer_reset").notNull().default(false),

    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    importRowRef: text("import_row_ref"),
    /** The value as it appeared in the source, when a correction was accepted. */
    importOriginalValue: text("import_original_value"),
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // The ordering key for every derived calculation.
    index("entries_vehicle_order_idx").on(t.vehicleId, t.occurredOn, t.readingTicks),
    index("entries_category_idx").on(t.categoryId),
    index("entries_batch_idx").on(t.importBatchId),
  ],
);

export const entryAttachments = pgTable(
  "entry_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_entry_idx").on(t.entryId)],
);

export const serviceReminders = pgTable(
  "service_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    dueReadingTicks: bigint("due_reading_ticks", { mode: "number" }),
    dueOn: date("due_on"),
    intervalTicks: bigint("interval_ticks", { mode: "number" }),
    intervalMonths: integer("interval_months"),
    completedEntryId: uuid("completed_entry_id").references(() => entries.id, {
      onDelete: "set null",
    }),
    isDone: boolean("is_done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reminders_vehicle_idx").on(t.vehicleId)],
);

/* ------------------------------------------------------------ supporting */

export const mileageRates = pgTable("mileage_rates", {
  year: smallint("year").primaryKey(),
  rateBusiness: numeric("rate_business", { precision: 6, scale: 4 }).notNull(),
  rateMedical: numeric("rate_medical", { precision: 6, scale: 4 }),
  rateCharity: numeric("rate_charity", { precision: 6, scale: 4 }),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type ServiceReminder = typeof serviceReminders.$inferSelect;
