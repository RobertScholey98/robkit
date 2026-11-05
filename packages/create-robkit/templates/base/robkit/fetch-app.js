// Fetches the app repo ROBKIT_APP names into apps/, at the commit
// robkit.json records, unless it's there already. The install's repository
// ignores its app repos, so a build from a clone of it, as Coolify's is,
// has none. The Dockerfile runs this before turbo prunes the app, with
// nothing installed yet, so it imports only Node's own modules.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const slug = process.env.ROBKIT_APP ?? "";
const dir = `apps/${slug}`;

if (!existsSync(`${dir}/package.json`)) {
  const { apps = {} } = JSON.parse(readFileSync("robkit.json", "utf8"));
  const app = apps[slug];
  if (!app?.source) {
    console.error(
      `${dir} isn't in the install, and robkit.json names no source for it. Share it with pnpm robkit share ${slug} <git URL>, then commit robkit.json.`,
    );
    process.exit(1);
  }
  const git = (...args) => execFileSync("git", args, { stdio: "inherit" });
  git("clone", "--quiet", app.source, dir);
  if (app.revision) git("-C", dir, "checkout", "--quiet", app.revision);
}
