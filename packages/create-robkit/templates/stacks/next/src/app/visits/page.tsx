import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@internal/ui/components/ui/card";
import { viewer } from "@robkit/next";
import Link from "next/link";
import { visitorId, visits } from "../../visits.ts";

/** When whoever is asking last visited. */
export default async function Visits() {
  const latest = await visits.latest(visitorId(await viewer()));

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-heading text-base leading-snug font-medium">
          Your latest visits
        </h1>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        <ol data-testid="latest-visits" className="grid gap-1">
          {latest.map((at) => (
            <li key={at.toISOString()}>
              <time dateTime={at.toISOString()}>{at.toUTCString()}</time>
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter>
        <Link href="/" className="underline underline-offset-4">
          Back
        </Link>
      </CardFooter>
    </Card>
  );
}
