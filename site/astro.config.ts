import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";
import { fenceTitle } from "./src/code.ts";

// Astro reports how it is used unless this is set. The site sends nothing
// anywhere, and neither does its build. Only where nothing has set it, so
// the shell decides.
process.env.ASTRO_TELEMETRY_DISABLED ??= "1";

export default defineConfig({
  site: "https://robkit.dev",
  output: "static",
  integrations: [mdx()],
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
