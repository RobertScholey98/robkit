import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { HomeCard } from "../home.tsx";
import { shownTo, visitAgainAs, visits, type Shown } from "../visits.ts";

// The guard's viewer arrives as context. Each handler hands it to a plain
// function in src/visits.ts, which a test calls with a viewer it builds.

/** What the page shows whoever is asking. A GET, so it records nothing. */
const shown = createServerFn({ method: "GET" }).handler(({ context }) =>
  shownTo(context.viewer, visits),
);

/** Records a visit by whoever is asking. */
const visit = createServerFn({ method: "POST" }).handler(({ context }) =>
  visitAgainAs(context.viewer, visits),
);

export const Route = createFileRoute("/")({
  loader: () => shown(),
  component: Home,
});

function Home() {
  const first = Route.useLoaderData();
  const [latest, setLatest] = useState<Shown>(first);
  const visitAgain = useServerFn(visit);

  return (
    <HomeCard
      shown={latest}
      onVisitAgain={() => {
        void visitAgain().then(setLatest);
      }}
    />
  );
}
