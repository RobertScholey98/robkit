import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { CodeId, RoleId } from "@robkit/guard";
import type { JWK } from "jose";

const core = pgSchema("core");

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const owner = core.table(
  "owner",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    // Always true and unique, so the database itself holds at most one owner
    // and a second setup racing the first fails.
    singleton: boolean("singleton").notNull().default(true).unique(),
  },
  (table) => [check("owner_singleton", sql`${table.singleton}`)],
);

export const accessCodes = core.table(
  "access_codes",
  {
    id: uuid("id").$type<CodeId>().primaryKey().defaultRandom(),
    // Plain text, so admin can show it again.
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    check("access_codes_code_shape", sql`${table.code} ~ '^[A-Z0-9]{3,32}$'`),
  ],
);

export const roles = core.table("roles", {
  id: uuid("id").$type<RoleId>().primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

/** Which codes hold which roles. The test code holds every role without a row. */
export const codeRoles = core.table(
  "code_roles",
  {
    codeId: uuid("code_id")
      .$type<CodeId>()
      .notNull()
      .references(() => accessCodes.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .$type<RoleId>()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.codeId, table.roleId] })],
);

/** The launcher catalog: each app core knows, and who may open it. */
export const apps = core.table(
  "apps",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    access: text("access", { enum: ["open", "roles", "owner"] })
      .notNull()
      .default("owner"),
    // An emoji the launcher shows, from the app's manifest.
    icon: text("icon"),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "apps_access_kind",
      sql`${table.access} in ('open', 'roles', 'owner')`,
    ),
  ],
);

/** The roles an app gated to roles lets in. */
export const appRoles = core.table(
  "app_roles",
  {
    appSlug: text("app_slug")
      .notNull()
      .references(() => apps.slug, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .$type<RoleId>()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.appSlug, table.roleId] })],
);

export const sessions = core.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => owner.id, {
      onDelete: "cascade",
    }),
    codeId: uuid("code_id")
      .$type<CodeId>()
      .references(() => accessCodes.id, {
        onDelete: "cascade",
      }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "sessions_one_holder",
      sql`num_nonnulls(${table.ownerId}, ${table.codeId}) = 1`,
    ),
  ],
);

export const signingKeys = core.table("signing_keys", {
  kid: text("kid").primaryKey(),
  privateJwk: jsonb("private_jwk").$type<JWK>().notNull(),
  publicJwk: jsonb("public_jwk").$type<JWK>().notNull(),
  createdAt: createdAt(),
});
