/** robkit's repository on GitHub. */
export const repoUrl = "https://github.com/RobertScholey98/robkit";

/**
 * The most a docs page's scripts may weigh as it opens, gzipped, in bytes:
 * inline ones, files and preloaded modules. DESIGN.md records it, and
 * `weight.test.ts` holds the built page to it.
 */
export const scriptBudget = 10 * 1024;

/** The first docs page, where the header's "Docs" link goes. */
export const docsHome = "/docs/get-started/what-you-need/";

/**
 * Where a reader edits a repo file on GitHub, by its path from the repo
 * root. It leads nowhere for a page until docs-site merges to main.
 */
export const editUrl = (path: string) => `${repoUrl}/edit/main/${path}`;

/**
 * Whether robkit's packages are still to be published. While it's true,
 * every page that shows `npm create robkit` says they aren't on npm yet,
 * with the way to make an install from a clone. Set it to false when
 * 0.1.0 is on npm, and the line goes from every page.
 */
export const preRelease = true;
