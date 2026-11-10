// The dry run of a release. It packs each package as the publish would,
// through pnpm, and checks what the tarballs hold. It makes no call to npm.
// CI's pull-request job runs it, and the release workflow runs it before
// it publishes. Build the packages first, as `pnpm release:dry-run` does:
//   node tooling/repo-checks/src/release-dry-run.ts [folder...]
// It packs each folder it's given, or every published package.
import { resolve } from "node:path";
import { pack, packProblems, publishedPackages } from "./published.ts";
import { dryRunProblems } from "./release.ts";

const folders = process.argv.slice(2);
const dirs =
  folders.length > 0
    ? folders.map((folder) => resolve(folder))
    : await publishedPackages();
const packed = await Promise.all(dirs.map(pack));
for (const { name, version, file, tarball } of packed) {
  console.log(`${name}@${version} ${file} ${String(tarball.byteLength)} B`);
}

const problems = [...packed.flatMap(packProblems), ...dryRunProblems(packed)];
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
const [first] = packed;
console.log(
  `${String(packed.length)} packages pack at ${first?.version ?? "no version"}. Nothing was published.`,
);
