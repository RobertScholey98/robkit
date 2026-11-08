import { count, eq } from "drizzle-orm";
import { database } from "./database.ts";
import { visit } from "./schema.ts";

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
