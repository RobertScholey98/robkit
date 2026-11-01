import { guarded, type GuardedEnv } from "@robkit/hono";
import { Hono } from "hono";
import postgres from "postgres";
import { renderToString } from "react-dom/server";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const sql = postgres(env("DATABASE_URL"), { max: 2 });

const app = new Hono<GuardedEnv>();

app.use(guarded({ access: { kind: "owner" }, core: env("ROBKIT_CORE_URL") }));

app.get("/", async (c) => {
  const { viewer } = c.var;
  const id = viewer.kind === "owner" ? viewer.id : "nobody";
  await sql`insert into visit (viewer) values (${id})`;
  const [counted] = await sql<{ visits: number }[]>`
    select count(*)::int as visits from visit where viewer = ${id}
  `;
  return c.html(
    `<!doctype html>${renderToString(
      <Page viewerId={id} visits={counted?.visits ?? 0} />,
    )}`,
  );
});

function Page({ viewerId, visits }: { viewerId: string; visits: number }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Example</title>
      </head>
      <body>
        <h1>Signed in as the owner</h1>
        <p>
          Owner id: <code data-testid="viewer-id">{viewerId}</code>
        </p>
        <p data-testid="visits">Visits: {visits}</p>
      </body>
    </html>
  );
}

export default app;
