import type { Viewer } from "@robkit/start";
import postgres from "postgres";

let sql: postgres.Sql | undefined;

function database(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  sql ??= postgres(url, { max: 2 });
  return sql;
}

/** Records a visit by the viewer and counts their visits so far. */
export async function recordVisit(viewer: Viewer): Promise<number> {
  const id = viewer.kind === "nobody" ? "nobody" : viewer.id;
  const db = database();
  await db`insert into visit (viewer) values (${id})`;
  const [counted] = await db<{ visits: number }[]>`
    select count(*)::int as visits from visit where viewer = ${id}
  `;
  return counted?.visits ?? 0;
}
