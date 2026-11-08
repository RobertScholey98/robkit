import type { Viewer } from "@robkit/next";
import { count, desc, eq } from "drizzle-orm";
import { database } from "./database.ts";
import { visit } from "./schema.ts";

/** Whose visits these are: the viewer's id, or "nobody" in an open app. */
export function visitorId(viewer: Viewer): string {
  return viewer.kind === "nobody" ? "nobody" : viewer.id;
}

/** Records a visit by `viewerId` and counts their visits so far. */
export async function recordVisit(viewerId: string): Promise<number> {
  const db = database();
  await db.insert(visit).values({ viewer: viewerId });
  const [counted] = await db
    .select({ visits: count() })
    .from(visit)
    .where(eq(visit.viewer, viewerId));
  return counted?.visits ?? 0;
}

/** When `viewerId` last visited, latest first. */
export async function latestVisits(
  viewerId: string,
  limit = 5,
): Promise<Date[]> {
  const rows = await database()
    .select({ at: visit.at })
    .from(visit)
    .where(eq(visit.viewer, viewerId))
    .orderBy(desc(visit.at))
    .limit(limit);
  return rows.map((row) => row.at);
}
