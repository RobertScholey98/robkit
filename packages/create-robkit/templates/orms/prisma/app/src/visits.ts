import { database } from "./database.ts";

/** Records a visit by `viewerId` and counts their visits so far. */
export async function recordVisit(viewerId: string): Promise<number> {
  const db = database();
  await db.visit.create({ data: { viewer: viewerId } });
  return db.visit.count({ where: { viewer: viewerId } });
}
