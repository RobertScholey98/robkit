/** robkit's repository on GitHub. */
export const repoUrl = "https://github.com/RobertScholey98/robkit";

/**
 * The most a docs page's scripts may weigh as it opens, gzipped, in bytes:
 * inline ones, files and preloaded modules. DESIGN.md records it, and
 * `weight.test.ts` holds the built page to it.
 */
export const scriptBudget = 10 * 1024;

/**
 * The most search may fetch the first time it opens, gzipped, in bytes:
 * the dialog's script and the index. DESIGN.md records it, and
 * `weight.test.ts` holds the build to it.
 */
export const searchBudget = 100 * 1024;

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

/** What robkit is, in a line: the home page's description and llms.txt's. */
export const siteDescription =
  "robkit is a kit for self-hosting small apps for your friends and family.";

/**
 * The one image every page's link preview shows, in `public/`. `pnpm
 * preview-image` makes it from scripts/preview-image.html.
 */
export const previewImage = {
  path: "/preview.png",
  width: 1200,
  height: 630,
  alt: "robkit, a kit for self-hosting small apps for your friends and family.",
};
