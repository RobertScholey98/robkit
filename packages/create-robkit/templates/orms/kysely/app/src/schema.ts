import type { Generated } from "kysely";

// The tables as queries see them. src/migrations creates them; keep the two
// in step. Tables named without a schema land in the app's own: its role
// has that schema first on its search path.

/** Every table, by name. */
export interface Database {
  visit: VisitTable;
}

/** One row per page load, by whoever made it. */
export interface VisitTable {
  id: Generated<number>;
  viewer: string;
  at: Generated<Date>;
}
