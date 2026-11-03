// Connects as the app, so it can only work once the app's role and schema
// exist. Unqualified names land in the app's schema through its search_path.
const { default: postgres } = await import(process.env.FIXTURE_POSTGRES);

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  onnotice: () => undefined,
});
await sql`create table if not exists entry (body text)`;
await sql`insert into entry select 'migrated' where not exists (select 1 from entry)`;
await sql.end();
