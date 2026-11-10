// The release workflow's publish step runs this, on main, with the npm token
// in NPM_TOKEN and the pack job's tarballs in a folder:
//   node tooling/repo-checks/src/release-publish.ts <tarball folder>
// It checks each tarball is one of main's packages at main's version, then
// publishes every one whose version npm lacks, so a release that stopped
// halfway runs again from where it stopped. Once npm has them all it writes
// `tag=v<version>` to $GITHUB_OUTPUT, for the step that tags.
import { spawnSync } from "node:child_process";
import { appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  authEnv,
  matchTarballs,
  publishArgs,
  publishPlan,
  readTarball,
  registryVersions,
  releasePackages,
} from "./publish-list.ts";

const token = process.env.NPM_TOKEN;
if (!token) {
  console.error(
    'NPM_TOKEN is missing, so nothing was published. Add it as a secret of the release environment, as CONTRIBUTING.md\'s "Releasing" says, then run the release again.',
  );
  process.exit(1);
}

const dir = process.argv[2];
if (dir === undefined) {
  console.error(
    "Name the folder that holds the pack job's tarballs: node tooling/repo-checks/src/release-publish.ts <folder>",
  );
  process.exit(1);
}

const packages = await releasePackages();
const files = (await readdir(dir)).filter((file) => file.endsWith(".tgz"));
const tarballs = await Promise.all(
  files.map((file) => readTarball(join(dir, file))),
);
const { matched, problems } = matchTarballs(packages, tarballs);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const published = new Map(
  await Promise.all(
    matched.map(
      async ({ name }) => [name, await registryVersions(name)] as const,
    ),
  ),
);
const { publish } = publishPlan(matched, published);
const onNpm = matched.length - publish.length;
console.log(
  `${String(publish.length)} to publish, ${String(onNpm)} already on npm.`,
);

for (const { name, version, tarball } of publish) {
  console.log(`Publishing ${name}@${version} from ${tarball}`);
  const { status } = spawnSync("pnpm", publishArgs(join(dir, tarball)), {
    cwd: dir,
    env: { ...process.env, ...authEnv(token) },
    stdio: "inherit",
  });
  if (status !== 0) {
    console.error(
      `pnpm publish failed for ${name}@${version}, and nothing after it was published. Fix what pnpm says above, then choose Re-run failed jobs on this run: it starts from ${name}.`,
    );
    process.exit(1);
  }
  published.set(name, [...(published.get(name) ?? []), version]);
}

const { tag } = publishPlan(matched, published);
console.log(
  `npm has every package. The next step pushes the tag ${tag ?? ""}.`,
);
if (tag !== undefined && process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
}
