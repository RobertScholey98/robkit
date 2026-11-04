import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("visit")
    .addColumn("id", "serial", (column) => column.primaryKey())
    .addColumn("viewer", "text", (column) => column.notNull())
    .addColumn("at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("visit").execute();
}
