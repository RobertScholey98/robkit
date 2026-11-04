import { database } from "./database.ts";

/** Records a visit by `viewerId` and counts their visits so far. */
export async function recordVisit(viewerId: string): Promise<number> {
  const db = database();
  await db.insertInto("visit").values({ viewer: viewerId }).execute();
  const counted = await db
    .selectFrom("visit")
    .select(({ fn }) => fn.countAll<string>().as("visits"))
    .where("viewer", "=", viewerId)
    .executeTakeFirstOrThrow();
  // Postgres counts in bigint, which pg hands over as a string.
  return Number(counted.visits);
}
