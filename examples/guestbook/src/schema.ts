import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Tables named without a schema land in the app's own: its role has that
// schema first on its search path.

/** One signature in the guestbook. */
export const entry = pgTable("entry", {
  id: serial().primaryKey(),
  name: text().notNull(),
  message: text().notNull(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
