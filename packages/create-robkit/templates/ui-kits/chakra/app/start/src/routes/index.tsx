import { Button, Card, Code, Heading, Text } from "@internal/ui";
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
      <Card.Root width="full" maxWidth="sm" rounded="xl">
        <Card.Header>
          <Heading as="h1" size="md" fontWeight="medium">
            {headingFor(first.kind)}
          </Heading>
        </Card.Header>
        <Card.Body gap="1" color="fg.muted">
          <Text>
            Viewer id:{" "}
            <Code data-testid="viewer-id" color="fg">
              {first.viewerId}
            </Code>
          </Text>
          <Text data-testid="visits">Visits: {visits}</Text>
        </Card.Body>
        <Card.Footer>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void visitAgain().then((next) => {
                setVisits(next.visits);
              });
            }}
          >
            Visit again
          </Button>
        </Card.Footer>
      </Card.Root>
    </main>
  );
}
