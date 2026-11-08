import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Tables named without a schema land in the app's own: its role has that
// schema first on its search path.

/** One row per page load, by whoever made it. */
export const visit = pgTable("visit", {
  id: serial().primaryKey(),
  viewer: text().notNull(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
