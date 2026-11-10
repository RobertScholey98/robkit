// The dry run of a release. It packs each package as the publish would,
// through pnpm, and checks what the tarballs hold. It makes no call to npm.
// CI's pull-request job runs it, and the release workflow's pack job runs it
// with --out to hand its tarballs to the publish job. Build the packages
// first, as `pnpm release:dry-run` does:
//   node tooling/repo-checks/src/release-dry-run.ts [--out <dir>] [folder...]
// It packs each folder it's given, or every published package. With --out
// it writes the tarballs it checked there, once every check passes.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pack, packProblems, publishedPackages } from "./published.ts";
import { dryRunProblems } from "./release.ts";

const { values, positionals } = parseArgs({
  options: { out: { type: "string" } },
  allowPositionals: true,
});
const dirs =
  positionals.length > 0
    ? positionals.map((folder) => resolve(folder))
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

if (values.out !== undefined) {
  await mkdir(values.out, { recursive: true });
  for (const { file, tarball } of packed) {
    await writeFile(join(values.out, file), tarball);
  }
  console.log(`Wrote ${String(packed.length)} tarballs to ${values.out}.`);
}
