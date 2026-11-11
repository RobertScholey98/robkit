/**
 * The commands in the first `sh` fence under the README's "Quickstart"
 * heading, one per line, without blank lines. The home page shows them, so
 * the page and the README can't say different things. `source` names the
 * file in the error when it has no such fence.
 */
export function quickstartCommands(readme: string, source: string): string[] {
  // A Windows checkout may end its lines with \r\n.
  const quickstart = readme
    .replaceAll("\r\n", "\n")
    .split(/^## Quickstart$/m)[1];
  const fence =
    quickstart === undefined
      ? null
      : /^```sh\n([\s\S]*?)^```$/m.exec(quickstart);
  if (fence?.[1] === undefined) {
    throw new Error(
      `${source} has no sh fence under "## Quickstart", which the home page shows.`,
    );
  }
  return fence[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
