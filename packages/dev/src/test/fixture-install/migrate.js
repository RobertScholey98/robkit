import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const slug = basename(process.cwd());
const failFor = process.env.FIXTURE_FAIL_MIGRATE;
if (failFor === "1" || failFor === slug) {
  console.error("migration failed on purpose");
  process.exit(1);
}
// Removes another app's folder after the runner found it, so the runner
// can't start that app.
if (process.env.FIXTURE_REMOVE_APP) {
  rmSync(`../${process.env.FIXTURE_REMOVE_APP}`, { recursive: true });
}
// Waits, once it has said so with its pid, until a test lets it finish.
if (process.env.FIXTURE_HOLD_MIGRATE === slug) {
  writeFileSync("migrating", String(process.pid));
  while (!existsSync("go")) await sleep(50);
}
// Applies each migration written by hand in its migrations folder, as a Go
// app's migrator does, as the app.
if (process.env.FIXTURE_POSTGRES && existsSync("migrations")) {
  const { default: postgres } = await import(process.env.FIXTURE_POSTGRES);
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    onnotice: () => undefined,
  });
  for (const file of readdirSync("migrations").sort()) {
    await sql.unsafe(readFileSync(`migrations/${file}`, "utf8"));
  }
  await sql.end();
}
writeFileSync("migrated", process.env.DATABASE_URL ?? "");
// What the script ran with, for a test to read.
writeFileSync(
  "migrated-with.json",
  JSON.stringify({
    app: process.env.ROBKIT_APP,
    port: process.env.PORT,
    vitest: process.env.VITEST,
    own: process.env.FIXTURE_OWN,
  }),
);
console.log("migrated");
