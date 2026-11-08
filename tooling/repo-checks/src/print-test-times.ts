// Prints how long each test task took in the newest turbo run summary, the
// slowest first, as a Markdown table. Turbo writes one to .turbo/runs/ when
// TURBO_RUN_SUMMARY is true. CI adds the table to its job summary:
//   node tooling/repo-checks/src/print-test-times.ts | tee -a "$GITHUB_STEP_SUMMARY"
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readJsonFile } from "./manifest.ts";
import { readTestTimes, timesTable } from "./task-times.ts";

const runs = join(".turbo", "runs");
const newest = existsSync(runs)
  ? readdirSync(runs)
      .filter((name) => name.endsWith(".json"))
      .map((name) => join(runs, name))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  : undefined;
if (newest === undefined) {
  console.error(
    ".turbo/runs has no run summary. Run turbo with TURBO_RUN_SUMMARY=true.",
  );
  process.exit(1);
}
console.log(timesTable(await readJsonFile(newest, readTestTimes)));
