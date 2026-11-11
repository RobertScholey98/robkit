import { Button } from "@internal/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import { useState } from "react";
import type { Shown } from "./visits.ts";

function headingFor(kind: Shown["kind"]): string {
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
 * The page's card: who is asking, their visits, and a button that records
 * another with `visitAgain`. A failed call says so and keeps the last
 * count, and the button is off while a call is out.
 */
export function HomeCard({
  first,
  visitAgain,
}: {
  first: Shown;
  visitAgain: () => Promise<Shown>;
}) {
  const [shown, setShown] = useState(first);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onVisitAgain() {
    setSending(true);
    try {
      setShown(await visitAgain());
      setFailed(false);
    } catch (cause) {
      console.error(cause);
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-base leading-snug font-medium">
            {headingFor(shown.kind)}
          </h1>
        </CardHeader>
        <CardContent className="grid gap-1 text-muted-foreground">
          <p>
            Viewer id:{" "}
            <code data-testid="viewer-id" className="text-foreground">
              {shown.viewerId}
            </code>
          </p>
          <p data-testid="visits">{`Visits: ${String(shown.visits)}`}</p>
          {failed && (
            <p role="alert" className="text-destructive">
              Couldn't record your visit. Try again.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            disabled={sending}
            onClick={() => void onVisitAgain()}
          >
            Visit again
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
