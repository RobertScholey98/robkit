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
