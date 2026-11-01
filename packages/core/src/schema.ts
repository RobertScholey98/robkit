import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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

export const accessCodes = core.table("access_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Upper-cased, and kept as plain text so admin can show it again.
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = core.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => owner.id, {
      onDelete: "cascade",
    }),
    codeId: uuid("code_id").references(() => accessCodes.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  // A session belongs to the owner or to one guest's code, never both.
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
