import { readFile } from "node:fs/promises";
import { guarded } from "@robkit/hono";
import { Hono } from "hono";
import { html } from "hono/html";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The client's script and styles: Vite's own modules in dev, else the build. */
async function clientAssets(): Promise<{ script: string; styles: string[] }> {
  const entry = "src/client/main.tsx";
  if (process.env.NODE_ENV !== "production") {
    return { script: `/${entry}`, styles: [] };
  }
  const manifest = JSON.parse(
    await readFile("dist/client/.vite/manifest.json", "utf8"),
  ) as Record<string, { file: string; css?: string[] } | undefined>;
  const built = manifest[entry];
  if (!built) throw new Error(`Admin's build has no ${entry}. Run its build.`);
  return {
    script: `/${built.file}`,
    styles: (built.css ?? []).map((file) => `/${file}`),
  };
}

const core = env("ROBKIT_CORE_URL");
const assets = await clientAssets();

const app = new Hono();

app.use(guarded({ access: { kind: "owner" }, core }));

// The page calls core from the browser, so it carries core's address.
app.get("*", (c) =>
  c.html(
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <meta name="robkit-core" content="${new URL(core).origin}" />
          <title>robkit admin</title>
          ${assets.styles.map(
            (href) => html`<link rel="stylesheet" href="${href}" />`,
          )}
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src="${assets.script}"></script>
        </body>
      </html>`,
  ),
);

export default app;
