import { count, eq } from "drizzle-orm";
import { database } from "./database.ts";
import { visit } from "./schema.ts";

/**
 * What the routes store visits through. The server passes `visits`, below,
 * and a test passes its own, so it needs no database.
 */
export interface Visits {
  /** Records a visit by `viewerId`. */
  record(viewerId: string): Promise<void>;
  /** How many visits `viewerId` has made. */
  count(viewerId: string): Promise<number>;
}

/** Visits in the app's database. */
export const visits: Visits = {
  async record(viewerId) {
    await database().insert(visit).values({ viewer: viewerId });
  },
  async count(viewerId) {
    const [counted] = await database()
      .select({ visits: count() })
      .from(visit)
      .where(eq(visit.viewer, viewerId));
    return counted?.visits ?? 0;
  },
};
