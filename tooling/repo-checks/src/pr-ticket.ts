import { posix } from "node:path";

/** The `## Ticket` section's text, without the template's HTML comments. */
function ticketSection(body: string): string | undefined {
  const match = /^##[ \t]+Ticket[ \t]*$([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/m.exec(
    body.replaceAll("\r\n", "\n"),
  );
  return match?.[1]?.replace(/<!--[\s\S]*?-->/g, "");
}

/** Every path under `.scratch/` that the text names. */
function pathsIn(text: string): string[] {
  return [...text.matchAll(/\.scratch\/[^\s`'"()<>[\]]+/g)].map(([path]) =>
    path.replace(/[.,;:]+$/, ""),
  );
}

/**
 * What's wrong with a pull request body's ticket line: it must name a file
 * under `.scratch/` that exists in the checkout.
 */
export function ticketProblems(
  body: string,
  exists: (path: string) => boolean,
): string[] {
  const section = ticketSection(body);
  if (section === undefined) {
    return [
      'The pull request has no "## Ticket" section. Fill in .github/pull_request_template.md and name the ticket\'s file under .scratch/.',
    ];
  }
  const paths = pathsIn(section);
  if (paths.length === 0) {
    return [
      "The pull request's Ticket section names no file under .scratch/. Name the ticket's file, such as .scratch/<feature>/issues/<ticket>.md.",
    ];
  }
  return paths.flatMap((path) => {
    if (!posix.normalize(path).startsWith(".scratch/")) {
      return [
        `The pull request's Ticket section names ${path}, which isn't under .scratch/.`,
      ];
    }
    return exists(path)
      ? []
      : [
          `The pull request's Ticket section names ${path}, which doesn't exist on this branch.`,
        ];
  });
}

/** The ticket paths a valid body names, for the CI log. */
export function ticketPaths(body: string): string[] {
  return pathsIn(ticketSection(body) ?? "");
}
