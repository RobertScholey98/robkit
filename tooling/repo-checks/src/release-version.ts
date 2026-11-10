// pnpm release:version runs this from the root of a clone of main. It
// opens the version pull request: a branch with every package at the next
// version, from `changeset version`, pushed, with a pull request on GitHub.
// It needs gh, GitHub's command line, signed in.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandProblem, runCommand } from "@robkit/input/command";
import { openVersionPullRequest } from "./version-pull-request.ts";

const run = promisify(execFile);

async function gh(args: string[]): Promise<string> {
  try {
    return (await run("gh", args)).stdout;
  } catch (error) {
    throw new CommandProblem(
      `gh ${args.join(" ")} failed, so the version pull request wasn't opened. Install gh from https://cli.github.com and run gh auth login, then run pnpm release:version again.`,
      { cause: error },
    );
  }
}

process.exitCode = await runCommand(async () => {
  const { url, version } = await openVersionPullRequest(process.cwd(), gh);
  console.log(
    `Opened the pull request that versions every package as ${version}: ${url}`,
  );
  console.log(
    "Once CI's gate passes and it merges, run the release workflow from main.",
  );
  return 0;
});
