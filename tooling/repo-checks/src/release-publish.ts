// The release workflow's publish step runs this, on main, after the gate
// and the dry run, with the npm token in NPM_TOKEN:
//   node tooling/repo-checks/src/release-publish.ts
// It publishes every package whose version npm lacks, so a release that
// stopped halfway runs again from where it stopped. Once npm has them all
// it writes `tag=v<version>` to $GITHUB_OUTPUT, for the step that tags.
import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import {
  authEnv,
  publishArgs,
  publishPlan,
  registryVersions,
  releasePackages,
} from "./release.ts";

const token = process.env.NPM_TOKEN;
if (!token) {
  console.error(
    'NPM_TOKEN is missing, so nothing was published. Add it as a secret of the release environment, as CONTRIBUTING.md\'s "Releasing" says, then run the release again.',
  );
  process.exit(1);
}

const packages = await releasePackages();
const published = new Map(
  await Promise.all(
    packages.map(
      async ({ name }) => [name, await registryVersions(name)] as const,
    ),
  ),
);
const { publish } = publishPlan(packages, published);
const onNpm = packages.length - publish.length;
console.log(
  `${String(publish.length)} to publish, ${String(onNpm)} already on npm.`,
);

for (const { name, version, dir } of publish) {
  console.log(`Publishing ${name}@${version}`);
  const { status } = spawnSync("pnpm", publishArgs, {
    cwd: dir,
    env: { ...process.env, ...authEnv(token) },
    stdio: "inherit",
  });
  if (status !== 0) {
    console.error(
      `pnpm publish failed for ${name}@${version}, and nothing after it was published. Fix what pnpm says above, then run the release again: it starts from ${name}.`,
    );
    process.exit(1);
  }
  published.set(name, [...(published.get(name) ?? []), version]);
}

const { tag } = publishPlan(packages, published);
console.log(
  `npm has every package. The next step pushes the tag ${tag ?? ""}.`,
);
if (tag !== undefined && process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
}
