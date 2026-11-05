import { readFile } from "node:fs/promises";
import { guarded } from "@robkit/hono";
import { isRecord, readCoreUrl } from "@robkit/session/input";
import { Hono } from "hono";
import { html } from "hono/html";

/** The client's script and styles: Vite's own modules in dev, else the build. */
async function clientAssets(): Promise<{ script: string; styles: string[] }> {
  const entry = "src/client/main.tsx";
  if (process.env.NODE_ENV !== "production") {
    return { script: `/${entry}`, styles: [] };
  }
  const manifest: unknown = JSON.parse(
    await readFile("dist/client/.vite/manifest.json", "utf8"),
  );
  const built = isRecord(manifest) ? manifest[entry] : undefined;
  if (!isRecord(built) || typeof built.file !== "string") {
    throw new Error(`Admin's build has no ${entry}. Run its build.`);
  }
  const css: unknown[] = Array.isArray(built.css) ? built.css : [];
  return {
    script: `/${built.file}`,
    styles: css
      .filter((file) => typeof file === "string")
      .map((file) => `/${file}`),
  };
}

const core = readCoreUrl(process.env);
if (typeof core !== "string") throw new Error(core.error);
const assets = await clientAssets();

const app = new Hono();

// Only the owner may open admin, whatever core's catalog says.
app.use(guarded({ app: "admin", access: { kind: "owner" }, core }));

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
