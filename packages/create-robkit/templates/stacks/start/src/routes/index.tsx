import { Button } from "@internal/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import type { Viewer } from "@robkit/start";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { recordVisit } from "../visits.ts";

/** Records a visit by whoever is asking. The guard's viewer arrives as context. */
const visit = createServerFn({ method: "POST" }).handler(
  async ({ context }) => {
    const { viewer } = context;
    const viewerId = viewer.kind === "nobody" ? "nobody" : viewer.id;
    return {
      kind: viewer.kind,
      viewerId,
      visits: await recordVisit(viewerId),
    };
  },
);

export const Route = createFileRoute("/")({
  loader: () => visit(),
  component: Home,
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

function Home() {
  const first = Route.useLoaderData();
  const [visits, setVisits] = useState(first.visits);
  const visitAgain = useServerFn(visit);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-base leading-snug font-medium">
            {headingFor(first.kind)}
          </h1>
        </CardHeader>
        <CardContent className="grid gap-1 text-muted-foreground">
          <p>
            Viewer id:{" "}
            <code data-testid="viewer-id" className="text-foreground">
              {first.viewerId}
            </code>
          </p>
          <p data-testid="visits">Visits: {visits}</p>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            onClick={() => {
              void visitAgain().then((next) => {
                setVisits(next.visits);
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
