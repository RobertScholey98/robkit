import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import { viewer, type Viewer } from "@robkit/next";
import Link from "next/link";
import { recordVisit, visitorId } from "../visits.ts";
import { VisitAgain } from "./visit-again.tsx";

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

/** Says who is asking, and records their visit. */
export default async function Home() {
  const asking = await viewer();
  const id = visitorId(asking);
  const visits = await recordVisit(id);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-heading text-base leading-snug font-medium">
          {headingFor(asking.kind)}
        </h1>
      </CardHeader>
      <CardContent className="grid gap-1 text-muted-foreground">
        <p>
          Viewer id:{" "}
          <code data-testid="viewer-id" className="text-foreground">
            {id}
          </code>
        </p>
        <VisitAgain visits={visits} />
      </CardContent>
      <CardFooter>
        <Link href="/visits" className="underline underline-offset-4">
          Your latest visits
        </Link>
      </CardFooter>
    </Card>
  );
}
