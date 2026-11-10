import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import type { Viewer } from "@robkit/next";
import Link from "next/link";
import { VisitAgain } from "./app/visit-again.tsx";
import { visitorId, type Visits } from "./visits.ts";

// The home page, as a plain function of the viewer and what it stores
// through. src/app/page.tsx reads the viewer once with viewer() and calls
// it, and a test calls it with a viewer it builds.

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

/** Says who is asking, and shows their visits. It records nothing. */
export async function Home({
  viewer,
  visits,
}: {
  viewer: Viewer;
  visits: Visits;
}) {
  const id = visitorId(viewer);
  const counted = await visits.count(id);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-heading text-base leading-snug font-medium">
          {headingFor(viewer.kind)}
        </h1>
      </CardHeader>
      <CardContent className="grid gap-1 text-muted-foreground">
        <p>
          Viewer id:{" "}
          <code data-testid="viewer-id" className="text-foreground">
            {id}
          </code>
        </p>
        <VisitAgain visits={counted} />
      </CardContent>
      <CardFooter>
        <Link href="/visits" className="underline underline-offset-4">
          Your latest visits
        </Link>
      </CardFooter>
    </Card>
  );
}
