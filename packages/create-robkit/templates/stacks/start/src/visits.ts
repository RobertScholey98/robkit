import postgres from "postgres";

let sql: postgres.Sql | undefined;

function database(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  sql ??= postgres(url, { max: 2 });
  return sql;
}

/** Records a visit by `viewerId` and counts their visits so far. */
export async function recordVisit(viewerId: string): Promise<number> {
  const db = database();
  await db`insert into visit (viewer) values (${viewerId})`;
  const [counted] = await db<{ visits: number }[]>`
    select count(*)::int as visits from visit where viewer = ${viewerId}
  `;
  return counted?.visits ?? 0;
}
