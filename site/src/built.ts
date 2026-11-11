// The parts of docs pages built from the repo's own files as the site
// builds, by id. content.config.ts renders each into the `built`
// collection. <Built id="..."> shows one on a page, and a part whose id is
// a page's ends that page, its headings in the page's list.

import { readRepoFile } from "./repo.ts";
import {
  glossaryMarkdown,
  linksToGitHub,
  listAfter,
  listIn,
  sectionUnder,
} from "./repo-markdown.ts";

/** Each built part's Markdown, by id. */
export const builtParts = {
  /** Every term in GLOSSARY.md. It ends the glossary page, whose id it has. */
  "concepts/glossary": async () =>
    glossaryMarkdown(await readRepoFile("GLOSSARY.md")),
  /** SECURITY.md's known gaps, with each link made one to GitHub. */
  "known-gaps": async () =>
    linksToGitHub(
      listIn(
        sectionUnder(
          await readRepoFile("SECURITY.md"),
          "### Known gaps",
          "SECURITY.md",
        ),
        "SECURITY.md's known gaps",
      ),
      "SECURITY.md",
    ),
  /** The ways past `robkit check` that SECURITY.md knows of. */
  "ways-past-the-lint": async () =>
    linksToGitHub(
      listAfter(
        await readRepoFile("SECURITY.md"),
        "The known ways past the lint",
        "SECURITY.md",
      ),
      "SECURITY.md",
    ),
} satisfies Record<string, () => Promise<string>>;

/** The id of a part built from a repo file. */
export type BuiltId = keyof typeof builtParts;
