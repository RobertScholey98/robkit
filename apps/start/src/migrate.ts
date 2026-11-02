import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

// The app's role has its own schema first on its search path, so the table
// lands there.
const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
try {
  await sql`
    create table if not exists visit (
      id serial primary key,
      viewer text not null,
      at timestamptz not null default now()
    )
  `;
} finally {
  await sql.end();
}
console.log("start migrated");
