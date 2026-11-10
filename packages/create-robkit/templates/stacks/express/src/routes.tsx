import { Button } from "@internal/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import type { GuardedResponse, Viewer } from "@robkit/express";
import { Router } from "express";
import { renderToString } from "react-dom/server";
import styles from "./styles.css?url";
import type { Visits } from "./visits.ts";

/**
 * The app's routes. They read the viewer the guard set, and store visits
 * through `visits`, which the server passes and a test stands in for.
 */
export function routes(visits: Visits): Router {
  const router = Router();

  // The page shows the count and changes nothing, since the guard can't
  // protect a GET from another app's link.
  router.get("/", async (_req, res: GuardedResponse) => {
    const { viewer } = res.locals;
    const id = visitorId(viewer);
    const page = (
      <Page
        heading={headingFor(viewer.kind)}
        viewerId={id}
        visits={await visits.count(id)}
      />
    );
    res.type("html").send(`<!doctype html>${renderToString(page)}`);
  });

  // The page's form posts here. 303 sends the browser back to the page
  // with a GET, so a reload doesn't post again.
  router.post("/visits", async (_req, res: GuardedResponse) => {
    await visits.record(visitorId(res.locals.viewer));
    res.redirect(303, "/");
  });

  return router;
}

/** Whose visits these are: the viewer's id, or "nobody" in an open app. */
function visitorId(viewer: Viewer): string {
  return viewer.kind === "nobody" ? "nobody" : viewer.id;
}

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
              <p data-testid="visits">{`Visits: ${String(visits)}`}</p>
            </CardContent>
            <CardFooter>
              <form method="post" action="/visits">
                <Button type="submit">Visit again</Button>
              </form>
            </CardFooter>
          </Card>
        </main>
      </body>
    </html>
  );
}
