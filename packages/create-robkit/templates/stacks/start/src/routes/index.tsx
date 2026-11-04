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
    <main>
      <h1>{headingFor(first.kind)}</h1>
      <p>
        Viewer id: <code data-testid="viewer-id">{first.viewerId}</code>
      </p>
      <p data-testid="visits">Visits: {visits}</p>
      <button
        type="button"
        onClick={() => {
          void visitAgain().then((next) => {
            setVisits(next.visits);
          });
        }}
      >
        Visit again
      </button>
    </main>
  );
}
