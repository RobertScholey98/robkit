import { guarded, type GuardedEnv, type Viewer } from "@robkit/hono";
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

// The rule is the one the owner set for this app in admin.
app.use(guarded({ app: env("ROBKIT_APP"), core: env("ROBKIT_CORE_URL") }));

app.get("/", async (c) => {
  const { viewer } = c.var;
  const id = viewer.kind === "nobody" ? "nobody" : viewer.id;
  await sql`insert into visit (viewer) values (${id})`;
  const [counted] = await sql<{ visits: number }[]>`
    select count(*)::int as visits from visit where viewer = ${id}
  `;
  return c.html(
    `<!doctype html>${renderToString(
      <Page
        heading={headingFor(viewer.kind)}
        viewerId={id}
        visits={counted?.visits ?? 0}
      />,
    )}`,
  );
});

function headingFor(kind: Viewer["kind"]): string {
  switch (kind) {
    case "owner":
      return "Signed in as the owner";
    case "guest":
      return "Signed in as a guest";
    case "nobody":
      return "Not signed in";
  }
}

function Page({
  heading,
  viewerId,
  visits,
}: {
  heading: string;
  viewerId: string;
  visits: number;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Example</title>
      </head>
      <body>
        <h1>{heading}</h1>
        <p>
          Viewer id: <code data-testid="viewer-id">{viewerId}</code>
        </p>
        <p data-testid="visits">Visits: {visits}</p>
      </body>
    </html>
  );
}

export default app;
