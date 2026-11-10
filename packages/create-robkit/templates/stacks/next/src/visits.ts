import type { Viewer } from "@robkit/next";
import { count, desc, eq } from "drizzle-orm";
import { database } from "./database.ts";
import { visit } from "./schema.ts";

/** Whose visits these are: the viewer's id, or "nobody" in an open app. */
export function visitorId(viewer: Viewer): string {
  return viewer.kind === "nobody" ? "nobody" : viewer.id;
}

/**
 * What the pages and the action store visits through. They pass `visits`,
 * below, and a test passes its own, so it needs no database.
 */
export interface Visits {
  /** Records a visit by `viewerId`. */
  record(viewerId: string): Promise<void>;
  /** How many visits `viewerId` has made. */
  count(viewerId: string): Promise<number>;
  /** When `viewerId` last visited, latest first. */
  latest(viewerId: string, limit?: number): Promise<Date[]>;
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
  async latest(viewerId, limit = 5) {
    const rows = await database()
      .select({ at: visit.at })
      .from(visit)
      .where(eq(visit.viewer, viewerId))
      .orderBy(desc(visit.at))
      .limit(limit);
    return rows.map((row) => row.at);
  },
};

/**
 * Records a visit by `viewer`, and counts their visits so far. The page's
 * action calls it with viewer(), and a test with a viewer it builds.
 */
export async function visitAgainAs(
  viewer: Viewer,
  visits: Visits,
): Promise<number> {
  const id = visitorId(viewer);
  await visits.record(id);
  return visits.count(id);
}
