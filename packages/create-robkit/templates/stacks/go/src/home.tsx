import { Button } from "@internal/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import { sessionFetch } from "@robkit/react";
import { useEffect, useRef, useState } from "react";

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
 * Asks the server who is asking and their visits: a GET reads them, and a
 * POST records a visit first. The guard answers the call, not the page,
 * when the session has lapsed, so `sessionFetch` sends the browser to sign
 * in and back. It gives up after 30 seconds.
 */
async function me(method: "GET" | "POST"): Promise<Visit> {
  const response = await sessionFetch("/api/me", { method });
  if (!response.ok) {
    throw new Error(`/api/me answered ${String(response.status)}.`);
  }
  const body: unknown = await response.json();
  return readVisit(body);
}

/** What the page says when a call to `/api/me` fails. */
const failed = {
  GET: "Couldn't load your visits. Reload the page to try again.",
  POST: "Couldn't record your visit. Try again.",
};

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

/**
 * The page: who is asking and their visits, read as it loads, and a button
 * that records another. A failed call says so, and keeps the last count.
 */
export function Home() {
  const [visit, setVisit] = useState<Visit>();
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(true);

  async function ask(method: "GET" | "POST") {
    setSending(true);
    try {
      setVisit(await me(method));
      setError(undefined);
    } catch (cause) {
      console.error(cause);
      setError(failed[method]);
    } finally {
      setSending(false);
    }
  }

  // Reads once as the page loads, and records nothing. StrictMode runs an
  // effect twice in development; the ref keeps that to one call.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void ask("GET");
  }, []);

  // Nothing shows until the first answer, so the heading never changes
  // under the viewer.
  if (!visit && !error) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-base leading-snug font-medium">
            {visit ? headingFor(visit.kind) : "Your visits"}
          </h1>
        </CardHeader>
        <CardContent className="grid gap-1 text-muted-foreground">
          {visit && (
            <>
              <p>
                Viewer id:{" "}
                <code data-testid="viewer-id" className="text-foreground">
                  {visit.viewerId}
                </code>
              </p>
              <p data-testid="visits">Visits: {visit.visits}</p>
            </>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        {visit && (
          <CardFooter>
            <Button
              type="button"
              disabled={sending}
              onClick={() => void ask("POST")}
            >
              Visit again
            </Button>
          </CardFooter>
        )}
      </Card>
    </main>
  );
}
