import { guest, owner } from "@robkit/start/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeCard } from "./home.tsx";
import { shownTo, visitAgainAs, type Visits } from "./visits.ts";

/** Visits kept in a list, in place of the database. */
function visitsInMemory(): Visits & { recorded: string[] } {
  const recorded: string[] = [];
  return {
    recorded,
    record: (viewerId) => {
      recorded.push(viewerId);
      return Promise.resolve();
    },
    count: (viewerId) =>
      Promise.resolve(recorded.filter((id) => id === viewerId).length),
  };
}

/** The page as `shown` draws it. */
function pageOf(shown: Awaited<ReturnType<typeof shownTo>>): string {
  return renderToStaticMarkup(
    <HomeCard
      shown={shown}
      onVisitAgain={() => {
        // A test doesn't press it.
      }}
    />,
  );
}

describe("the page", () => {
  it("shows the owner who they are and their visits, and records none", async () => {
    const visits = visitsInMemory();

    const shown = await shownTo(owner(), visits);

    expect(shown).toEqual({ kind: "owner", viewerId: "owner-1", visits: 0 });
    expect(pageOf(shown)).toContain("Signed in as the owner");
    expect(pageOf(shown)).toContain(">owner-1</code>");
    expect(pageOf(shown)).toContain("Visits: 0");
    expect(visits.recorded).toEqual([]);
  });

  it("records a guest's visit when they press the button", async () => {
    const visits = visitsInMemory();

    const shown = await visitAgainAs(guest({ roles: ["family"] }), visits);

    expect(shown).toEqual({ kind: "guest", viewerId: "code-1", visits: 1 });
    expect(visits.recorded).toEqual(["code-1"]);
    expect(pageOf(shown)).toContain("Signed in as a guest");
    expect(pageOf(shown)).toContain("Visits: 1");
  });
});
