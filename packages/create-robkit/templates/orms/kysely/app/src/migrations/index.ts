import type { Migration } from "kysely/migration";
import * as visit from "./0001_visit.ts";

/**
 * Every migration, by name. Kysely runs the ones that haven't run yet in
 * name order, so a new one gets the next number.
 */
export const migrations: Record<string, Migration> = {
  "0001_visit": visit,
};
