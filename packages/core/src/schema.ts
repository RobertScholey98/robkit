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

export const sessions = core.table("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owner.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const signingKeys = core.table("signing_keys", {
  kid: text("kid").primaryKey(),
  privateJwk: jsonb("private_jwk").$type<JWK>().notNull(),
  publicJwk: jsonb("public_jwk").$type<JWK>().notNull(),
  createdAt: createdAt(),
});
