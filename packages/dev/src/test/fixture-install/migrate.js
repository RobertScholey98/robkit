import { rmSync, writeFileSync } from "node:fs";

if (process.env.FIXTURE_FAIL_MIGRATE) {
  console.error("migration failed on purpose");
  process.exit(1);
}
// Removes another app's folder after the runner found it, so the runner
// can't start that app.
if (process.env.FIXTURE_REMOVE_APP) {
  rmSync(`../${process.env.FIXTURE_REMOVE_APP}`, { recursive: true });
}
writeFileSync("migrated", process.env.DATABASE_URL ?? "");
// What the script ran with, for a test to read.
writeFileSync(
  "migrated-with.json",
  JSON.stringify({
    app: process.env.ROBKIT_APP,
    port: process.env.PORT,
    vitest: process.env.VITEST,
  }),
);
console.log("migrated");
