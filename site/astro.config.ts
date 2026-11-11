import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";
import { fenceTitle } from "./src/code.ts";
import { writeSearchIndex } from "./src/search-index.ts";
import { writeMarkdownCopies } from "./src/markdown-copies.ts";

// Astro reports how it is used unless this is set. The site sends nothing
// anywhere, and neither does its build. Only where nothing has set it, so
// the shell decides.
process.env.ASTRO_TELEMETRY_DISABLED ??= "1";

const site = "https://robkit.dev";

export default defineConfig({
  site,
  output: "static",
  integrations: [
    mdx(),
    {
      // The docs search's index, from the built pages: see search-index.ts.
      name: "robkit:search",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          await writeSearchIndex(fileURLToPath(dir));
        },
      },
    },
    {
      // Each docs page's Markdown copy: see markdown-copies.ts.
      name: "robkit:markdown",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          await writeMarkdownCopies(fileURLToPath(dir));
        },
      },
    },
  ],
  markdown: {
    shikiConfig: {
      // Colours come from the style guide's tokens: see base.css.
      theme: "css-variables",
      transformers: [
        {
          // A fence's title="..." names the file its code is from.
          // CodeBlock.astro shows it above the code.
          name: "robkit:title",
          pre(node) {
            const title = fenceTitle(this.options.meta?.__raw);
            if (title !== undefined) node.properties["data-title"] = title;
          },
        },
      ],
    },
  },
});
