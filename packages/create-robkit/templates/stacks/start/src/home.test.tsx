// @vitest-environment happy-dom
import { guest, owner } from "@robkit/start/testing";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeCard } from "./home.tsx";
import { shownTo, visitAgainAs, type Shown, type Visits } from "./visits.ts";

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
      first={shown}
      visitAgain={() => {
        throw new Error("A test of the drawn page doesn't press it.");
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the button", () => {
  const first: Shown = { kind: "owner", viewerId: "owner-1", visits: 2 };

  it("records one visit however often it is pressed while the call is out", async () => {
    let answer: (shown: Shown) => void = () => undefined;
    const visitAgain = vi.fn(
      () =>
        new Promise<Shown>((resolve) => {
          answer = resolve;
        }),
    );
    render(<HomeCard first={first} visitAgain={visitAgain} />);
    const button = screen.getByRole("button", { name: "Visit again" });

    await userEvent.click(button);
    await userEvent.click(button);
    answer({ ...first, visits: 3 });

    expect(await screen.findByText("Visits: 3")).toBeTruthy();
    expect(visitAgain).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("says so when the call fails, and keeps the count", async () => {
    // The card reports the failure to the console.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <HomeCard
        first={first}
        visitAgain={() => Promise.reject(new Error("The server answered 500."))}
      />,
    );
    const button = screen.getByRole("button", { name: "Visit again" });

    await userEvent.click(button);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't record your visit. Try again.",
    );
    expect(screen.getByTestId("visits").textContent).toBe("Visits: 2");
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});
