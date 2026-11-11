// Prettier formats the site's .astro files with Astro's plugin. Prettier
// runs from the repo root, which doesn't have the plugin, so this file
// resolves it from the site.

/** @type {import("prettier").Config} */
export default {
  plugins: [import.meta.resolve("prettier-plugin-astro")],
  overrides: [{ files: "*.astro", options: { parser: "astro" } }],
};
