import { Button } from "@internal/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
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

/** The page's card: who is asking, their visits, and a button for another. */
export function HomeCard({
  shown,
  onVisitAgain,
}: {
  shown: Shown;
  onVisitAgain: () => void;
}) {
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
        </CardContent>
        <CardFooter>
          <Button type="button" onClick={onVisitAgain}>
            Visit again
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
