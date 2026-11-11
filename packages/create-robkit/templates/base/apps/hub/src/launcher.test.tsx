// @vitest-environment happy-dom
import { fakeCore, type Routes } from "@internal/core-client/fake-core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";

// vitest.config.ts opens the page at https://hub.robkit.test/.
const core = "https://core.robkit.test";

const owner = {
  state: "signed-in",
  profile: { kind: "owner", id: "o_1", username: "rob" },
};

const guest = {
  state: "signed-in",
  profile: { kind: "guest", id: "c_1", name: "Grandma" },
};

/** Stubs `fetch` with core answering `routes`, `session` signed in. */
function coreWith(session: object, routes: Routes): void {
  vi.stubGlobal(
    "fetch",
    fakeCore(core, { "GET /session": () => ({ body: session }), ...routes }),
  );
}

beforeEach(() => {
  // callCore reports a failed call to the console; some tests fail calls on
  // purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the launcher", () => {
  it("links to each app core lists for the viewer, on its own subdomain", async () => {
    coreWith(owner, {
      "GET /launcher": () => ({
        body: {
          apps: [
            { slug: "example", name: "example", icon: "📦" },
            { slug: "notes", name: "Notes", icon: null },
          ],
        },
      }),
    });
    render(<App />);

    const links = await screen.findAllByRole("link");

    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["📦example", "https://example.robkit.test"],
      ["Notes", "https://notes.robkit.test"],
    ]);
    expect(screen.getByText("Signed in as").textContent).toBe(
      "Signed in as rob",
    );
  });

  it("tells the owner how to add an app when there are none", async () => {
    coreWith(owner, { "GET /launcher": () => ({ body: { apps: [] } }) });
    render(<App />);

    const none = await screen.findByRole("heading", { name: "No apps yet." });

    expect(none.parentElement?.textContent).toBe(
      "No apps yet.Apps you add with robkit add show up here.",
    );
  });

  it("tells a guest that shared apps show up there", async () => {
    coreWith(guest, { "GET /launcher": () => ({ body: { apps: [] } }) });
    render(<App />);

    const none = await screen.findByRole("heading", { name: "No apps yet." });

    expect(none.parentElement?.textContent).toBe(
      "No apps yet.Apps shared with you show up here.",
    );
    expect(screen.getByText("Signed in as").textContent).toBe(
      "Signed in as Grandma",
    );
  });

  it("shows core's sentence when it can't list the apps", async () => {
    coreWith(owner, {
      "GET /launcher": () => ({
        status: 503,
        body: { error: "Core is starting. Try again in a moment." },
      }),
    });
    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Core is starting. Try again in a moment.",
    );
  });

  it("drops an app the owner closes when the tab comes back into view", async () => {
    let apps = [{ slug: "example", name: "example", icon: null }];
    coreWith(guest, { "GET /launcher": () => ({ body: { apps } }) });
    render(<App />);
    await screen.findByRole("link", { name: "example" });

    apps = [];
    document.dispatchEvent(new Event("visibilitychange"));

    expect(
      await screen.findByRole("heading", { name: "No apps yet." }),
    ).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });

  describe("while open", () => {
    let session: object;
    let reachable: boolean;

    beforeEach(() => {
      // Only the launcher's poll runs on fake time; the rest of the page
      // keeps real time.
      vi.useFakeTimers({
        toFake: ["setInterval", "clearInterval"],
        shouldAdvanceTime: true,
      });
      session = guest;
      reachable = true;
      const answer = fakeCore(core, {
        "GET /session": () => ({ body: session }),
        "GET /launcher": () => ({
          body: { apps: [{ slug: "example", name: "example", icon: null }] },
        }),
      });
      vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
        reachable
          ? answer(input, init)
          : Promise.reject(new TypeError("Failed to fetch")),
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows the sign-in page within a poll of signing out elsewhere", async () => {
      render(<App />);
      await screen.findByRole("link", { name: "example" });

      session = { state: "signed-out" };
      await vi.advanceTimersByTimeAsync(30_000);

      expect(await screen.findByLabelText("Access code")).toBeDefined();
      expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    });

    it("shows the sign-in page as the tab becomes visible after signing out", async () => {
      render(<App />);
      await screen.findByRole("link", { name: "example" });

      session = { state: "signed-out" };
      document.dispatchEvent(new Event("visibilitychange"));

      expect(await screen.findByLabelText("Access code")).toBeDefined();
    });

    it("follows a sign-in as someone else in another tab", async () => {
      render(<App />);
      await screen.findByRole("link", { name: "example" });

      session = owner;
      document.dispatchEvent(new Event("visibilitychange"));

      expect(await screen.findByText("rob")).toBeDefined();
      expect(screen.getByText("Signed in as").textContent).toBe(
        "Signed in as rob",
      );
    });

    it("shows a failure to retry when core can't be reached, not the sign-in page", async () => {
      const viewer = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      render(<App />);
      await screen.findByRole("link", { name: "example" });

      reachable = false;
      await vi.advanceTimersByTimeAsync(30_000);

      expect((await screen.findByRole("alert")).textContent).toBe(
        `Couldn't reach core at ${core}.`,
      );
      expect(screen.queryByLabelText("Access code")).toBeNull();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();

      reachable = true;
      await viewer.click(screen.getByRole("button", { name: "Try again" }));

      expect(
        await screen.findByRole("link", { name: "example" }),
      ).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("signs the viewer out, back to the sign-in form", async () => {
    coreWith(guest, {
      "GET /launcher": () => ({ body: { apps: [] } }),
      "POST /logout": () => ({}),
    });
    const viewer = userEvent.setup();
    render(<App />);

    await viewer.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByLabelText("Access code")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("stays signed in and says why when signing out fails", async () => {
    coreWith(guest, { "GET /launcher": () => ({ body: { apps: [] } }) });
    const viewer = userEvent.setup();
    render(<App />);

    await viewer.click(await screen.findByRole("button", { name: "Sign out" }));

    const main = screen.getByRole("main");
    expect((await within(main).findByRole("alert")).textContent).toBe(
      "Core answered 404.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  });
});
