import { Card, Code, Heading, Provider, Text } from "@internal/ui";
import { guarded, type GuardedEnv, type Viewer } from "@robkit/hono";
import { Hono } from "hono";
import { renderToString } from "react-dom/server";
import styles from "./styles.css?url";
import { recordVisit } from "./visits.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const app = new Hono<GuardedEnv>();

// The rule is the one the owner set for this app in admin.
app.use(guarded({ app: env("ROBKIT_APP"), core: env("ROBKIT_CORE_URL") }));

app.get("/", async (c) => {
  const { viewer } = c.var;
  const id = viewer.kind === "nobody" ? "nobody" : viewer.id;
  const visits = await recordVisit(id);
  return c.html(
    `<!doctype html>${renderToString(
      <Page heading={headingFor(viewer.kind)} viewerId={id} visits={visits} />,
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
        <link rel="stylesheet" href={styles} />
      </head>
      <body>
        <Provider>
          <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
            <Card.Root width="full" maxWidth="sm" rounded="xl">
              <Card.Header>
                <Heading as="h1" size="md" fontWeight="medium">
                  {heading}
                </Heading>
              </Card.Header>
              <Card.Body gap="1" color="fg.muted">
                <Text>
                  Viewer id:{" "}
                  <Code data-testid="viewer-id" color="fg">
                    {viewerId}
                  </Code>
                </Text>
                <Text data-testid="visits">Visits: {visits}</Text>
              </Card.Body>
            </Card.Root>
          </main>
        </Provider>
      </body>
    </html>
  );
}

export default app;
