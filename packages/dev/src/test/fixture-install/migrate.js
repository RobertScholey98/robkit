import { writeFileSync } from "node:fs";

if (process.env.FIXTURE_FAIL_MIGRATE) {
  console.error("migration failed on purpose");
  process.exit(1);
}
writeFileSync("migrated", process.env.DATABASE_URL ?? "");
console.log("migrated");
