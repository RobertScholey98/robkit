import { guarded } from "@robkit/hono";
import { Hono } from "hono";
import { html } from "hono/html";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const core = env("ROBKIT_CORE_URL");

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
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src="/src/client/main.tsx"></script>
        </body>
      </html>`,
  ),
);

export default app;
