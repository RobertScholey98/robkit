"use client";

import { Button } from "@internal/ui/components/ui/button";
import { useActionState } from "react";
import { visitAgain } from "./actions.ts";

/** The visit count, and a button that records another visit. */
export function VisitAgain({ visits }: { visits: number }) {
  const [count, action, pending] = useActionState(visitAgain, visits);
  return (
    <form action={action} className="grid gap-3">
      <p data-testid="visits">{`Visits: ${String(count)}`}</p>
      <Button type="submit" disabled={pending} className="justify-self-start">
        Visit again
      </Button>
    </form>
  );
}
