/**
 * A command that installs a system package: Playwright's `--with-deps` and
 * `install-deps`, which run apt, and `apt install` or `apt-get install`
 * with any options between.
 */
const installsSystemPackage =
  /--with-deps\b|\binstall-deps\b|\bapt(?:-get)?\s+(?:-\S+\s+)*install\b/;

/**
 * Lists each line of `workflow`, the text of the file at `path`, that
 * installs a system package. Those come from Ubuntu's mirrors, so a run
 * with such a step fails when the runner can't reach them. A comment may
 * name one.
 */
export function systemPackageInstalls(
  path: string,
  workflow: string,
): string[] {
  return workflow.split("\n").flatMap((line, index) => {
    const step = line.trim().replace(/^- /, "");
    if (step.startsWith("#") || !installsSystemPackage.test(step)) return [];
    return [
      `${path} line ${String(index + 1)} installs a system package: ${step}. Those come from Ubuntu's mirrors, and the run fails when the runner can't reach them. The runner's image has the libraries Chromium needs, so install the browser alone, with playwright install chromium.`,
    ];
  });
}

/** `uses: owner/action@<commit> # v1.2.3`, the one way to name an action. */
const pinned = /^uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

/**
 * Lists each action `workflow`, the text of the file at `path`, names by
 * anything but a commit with its version beside it. A tag or branch can be
 * moved to other code; a commit can't. A workflow in the same repo, named
 * `./`, is the repo's own code.
 */
export function unpinnedActions(path: string, workflow: string): string[] {
  return workflow.split("\n").flatMap((line, index) => {
    const uses = /^\s*(?:-\s*)?(uses:.*?)\s*$/.exec(line)?.[1];
    if (uses === undefined || uses.startsWith("uses: ./")) return [];
    if (pinned.test(uses)) return [];
    return [
      `${path} line ${String(index + 1)} names ${uses} by tag or branch. Name the action by its commit, with the version in a comment: uses: owner/action@<commit> # v1.2.3. gh api repos/<owner>/<action>/git/ref/tags/<tag> gives the commit.`,
    ];
  });
}
