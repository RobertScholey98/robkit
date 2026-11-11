/**
 * The docs site's pages a reader sees, as globs from the repo root: the
 * MDX under its content folder, and the `.astro` and `.mdx` files under
 * its pages folder. The doc-examples, glossary and site command checks
 * read these. They leave out `site/DESIGN.md`, the Astro config, `dist`,
 * `.astro` and `node_modules`.
 */
export const sitePageGlobs = [
  "site/src/content/**/*.mdx",
  "site/src/pages/**/*.{astro,mdx}",
];
