import { Card, CardContent, CardHeader } from "@internal/ui/components/ui/card";
import { guarded, type GuardedResponse, type Viewer } from "@robkit/express";
import { orExit, readGuardEnv } from "@robkit/input";
import express from "express";
import { renderToString } from "react-dom/server";
import styles from "./styles.css?url";
import { recordVisit } from "./visits.ts";

const app = express();

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const guard = orExit(readGuardEnv(process.env));

// The rule is the one the owner set for this app in admin.
app.use(guarded(guard));

app.get("/", async (_req, res: GuardedResponse) => {
  const { viewer } = res.locals;
  const id = viewer.kind === "nobody" ? "nobody" : viewer.id;
  const visits = await recordVisit(id);
  res
    .type("html")
    .send(
      `<!doctype html>${renderToString(
        <Page
          heading={headingFor(viewer.kind)}
          viewerId={id}
          visits={visits}
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
        <link rel="stylesheet" href={styles} />
      </head>
      <body>
        <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <h1 className="font-heading text-base leading-snug font-medium">
                {heading}
              </h1>
            </CardHeader>
            <CardContent className="grid gap-1 text-muted-foreground">
              <p>
                Viewer id:{" "}
                <code data-testid="viewer-id" className="text-foreground">
                  {viewerId}
                </code>
              </p>
              <p data-testid="visits">Visits: {visits}</p>
            </CardContent>
          </Card>
        </main>
      </body>
    </html>
  );
}

export default app;
