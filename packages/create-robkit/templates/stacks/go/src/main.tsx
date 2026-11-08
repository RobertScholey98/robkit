import { Button } from "@internal/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import { sessionFetch } from "@robkit/react";
import { StrictMode, Suspense, startTransition, use, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Kind = "owner" | "guest" | "nobody";

/** What `/api/me` answers: who is asking, and their visits so far. */
interface Visit {
  kind: Kind;
  viewerId: string;
  visits: number;
}

function readVisit(body: unknown): Visit {
  if (
    typeof body === "object" &&
    body !== null &&
    "kind" in body &&
    "viewerId" in body &&
    "visits" in body
  ) {
    const { kind, viewerId, visits } = body;
    if (
      (kind === "owner" || kind === "guest" || kind === "nobody") &&
      typeof viewerId === "string" &&
      typeof visits === "number"
    ) {
      return { kind, viewerId, visits };
    }
  }
  throw new Error(
    `/api/me answered ${JSON.stringify(body)}, not who is asking and their visits.`,
  );
}

/**
 * Records a visit by whoever is asking. The guard answers the call, not
 * the page, when the session has lapsed, so `sessionFetch` sends the
 * browser to sign in and back.
 */
async function visit(): Promise<Visit> {
  const response = await sessionFetch("/api/me", { method: "POST" });
  if (!response.ok) {
    throw new Error(`/api/me answered ${String(response.status)}.`);
  }
  const body: unknown = await response.json();
  return readVisit(body);
}

function headingFor(kind: Kind): string {
  switch (kind) {
    case "owner":
      return "Signed in as the owner";
    case "guest":
      return "Signed in as a guest";
    case "nobody":
      return "Not signed in";
  }
}

// Started once, as the page loads, so each load records one visit.
const firstVisit = visit();

function Home() {
  const [latest, setLatest] = useState(firstVisit);
  const { kind, viewerId, visits } = use(latest);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-base leading-snug font-medium">
            {headingFor(kind)}
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
        <CardFooter>
          <Button
            type="button"
            onClick={() => {
              // Keeps this count on screen until the next one arrives.
              startTransition(() => {
                setLatest(visit());
              });
            }}
          >
            Visit again
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

const root = document.createElement("div");
document.body.append(root);
createRoot(root).render(
  <StrictMode>
    <Suspense>
      <Home />
    </Suspense>
  </StrictMode>,
);
