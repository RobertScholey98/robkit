// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "./home.tsx";

/**
 * Stubs `fetch` with the Go server's `/api/me`, which answers each call
 * with the next of `answers`: a visit count, or a status it fails with.
 * Returns each call's method.
 */
function serverAnswering(...answers: (number | { status: number })[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (_: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    const answer = answers.shift() ?? { status: 500 };
    return Promise.resolve(
      typeof answer === "number"
        ? Response.json({ kind: "owner", viewerId: "owner-1", visits: answer })
        : new Response("Couldn't count the visits.", answer),
    );
  });
  return calls;
}

beforeEach(() => {
  // The page reports a failed call to the console; some tests fail calls on
  // purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the page", () => {
  it("shows who is asking and their visits, and records one when asked", async () => {
    const calls = serverAnswering(2, 3);
    render(<Home />);

    expect(await screen.findByText("Signed in as the owner")).toBeTruthy();
    expect(screen.getByTestId("visits").textContent).toBe("Visits: 2");

    await userEvent.click(screen.getByRole("button", { name: "Visit again" }));

    expect(await screen.findByText("Visits: 3")).toBeTruthy();
    expect(calls).toEqual(["GET", "POST"]);
  });

  it("draws nothing until the server answers", () => {
    vi.stubGlobal("fetch", () => new Promise<never>(() => undefined));

    const { container } = render(<Home />);

    expect(container.innerHTML).toBe("");
  });

  it("says so when it can't load the visits", async () => {
    serverAnswering({ status: 500 });
    render(<Home />);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't load your visits. Reload the page to try again.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says so when it can't record a visit, and keeps the count", async () => {
    serverAnswering(2, { status: 500 });
    render(<Home />);
    const button = await screen.findByRole("button", { name: "Visit again" });

    await userEvent.click(button);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't record your visit. Try again.",
    );
    expect(screen.getByTestId("visits").textContent).toBe("Visits: 2");
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});
