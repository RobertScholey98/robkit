import type { Viewer } from "@robkit/start";
import { count, eq } from "drizzle-orm";
import { database } from "./database.ts";
import { visit } from "./schema.ts";

/**
 * What the page's server functions store visits through. They pass
 * `visits`, below, and a test passes its own, so it needs no database.
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

/** What the page shows: who is asking, and their visits so far. */
export interface Shown {
  kind: Viewer["kind"];
  viewerId: string;
  visits: number;
}

// The page's server functions hand context.viewer to these plain
// functions, and a test calls them with a viewer it builds.

/** What the page shows `viewer`. It records nothing. */
export async function shownTo(viewer: Viewer, visits: Visits): Promise<Shown> {
  const viewerId = viewer.kind === "nobody" ? "nobody" : viewer.id;
  return { kind: viewer.kind, viewerId, visits: await visits.count(viewerId) };
}

/** Records a visit by `viewer`, and what the page then shows them. */
export async function visitAgainAs(
  viewer: Viewer,
  visits: Visits,
): Promise<Shown> {
  await visits.record(viewer.kind === "nobody" ? "nobody" : viewer.id);
  return shownTo(viewer, visits);
}
