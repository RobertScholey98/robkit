import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";

// Astro reports how it is used unless this is set. The site sends nothing
// anywhere, and neither does its build. Only where nothing has set it, so
// the shell decides.
process.env.ASTRO_TELEMETRY_DISABLED ??= "1";

export default defineConfig({
  site: "https://robkit.dev",
  output: "static",
  integrations: [mdx()],
});
