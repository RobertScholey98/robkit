import { nightlySet, pullRequestSet } from "./combinations.ts";

// Prints a set of combinations as JSON, for a GitHub Actions job matrix:
// `node src/plan.ts pull-request` or `node src/plan.ts nightly`.
const sets = { "pull-request": pullRequestSet, nightly: nightlySet };
const which = process.argv[2];
if (which !== "pull-request" && which !== "nightly") {
  console.error("Usage: plan pull-request|nightly");
  process.exit(1);
}
console.log(JSON.stringify(sets[which]()));
