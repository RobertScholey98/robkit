import { guest, owner } from "@robkit/next/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Home } from "./home.tsx";
import { visitAgainAs, type Visits } from "./visits.ts";

/** Visits kept in a list, in place of the database. */
function visitsInMemory(): Visits & { recorded: string[] } {
  const recorded: string[] = [];
  const by = (viewerId: string) => recorded.filter((id) => id === viewerId);
  return {
    recorded,
    record: (viewerId) => {
      recorded.push(viewerId);
      return Promise.resolve();
    },
    count: (viewerId) => Promise.resolve(by(viewerId).length),
    latest: () => Promise.resolve([]),
  };
}

describe("the page", () => {
  it("shows the owner who they are and their visits, and records none", async () => {
    const visits = visitsInMemory();

    const page = renderToStaticMarkup(await Home({ viewer: owner(), visits }));

    expect(page).toContain("Signed in as the owner");
    expect(page).toContain(">owner-1</code>");
    expect(page).toContain("Visits: 0");
    expect(visits.recorded).toEqual([]);
  });

  it("records a guest's visit when they press the button", async () => {
    const visits = visitsInMemory();
    const viewer = guest({ roles: ["family"] });

    const counted = await visitAgainAs(viewer, visits);
    const page = renderToStaticMarkup(await Home({ viewer, visits }));

    expect(counted).toBe(1);
    expect(visits.recorded).toEqual(["code-1"]);
    expect(page).toContain("Signed in as a guest");
    expect(page).toContain("Visits: 1");
  });
});
