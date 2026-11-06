// Fails when a package's coverage threshold sits more than ratchetSlack
// points under what its tests cover, and says what to raise it to. CI runs
// it from the workspace root after `pnpm check:all`, on the coverage reports
// that run wrote, so a threshold set from a run CI can't match fails there:
//   node tooling/repo-checks/src/check-coverage-ratchet.ts
import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJsonFile } from "./manifest.ts";
import {
  readCoverage,
  thresholdsBelowCoverage,
  thresholdsIn,
  vitestConfigs,
} from "./coverage-thresholds.ts";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const problems: string[] = [];
for (const found of globSync(vitestConfigs, { cwd: root }).sort()) {
  const path = found.replaceAll("\\", "/");
  const thresholds = thresholdsIn(readFileSync(join(root, path), "utf8"));
  if (thresholds === undefined) continue;
  const report = `${dirname(path)}/coverage/coverage-final.json`;
  if (!existsSync(join(root, report))) {
    problems.push(`${report} is missing. Run the package's tests first.`);
    continue;
  }
  const measured = await readJsonFile(join(root, report), readCoverage);
  problems.push(...thresholdsBelowCoverage(path, thresholds, measured));
}

for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
