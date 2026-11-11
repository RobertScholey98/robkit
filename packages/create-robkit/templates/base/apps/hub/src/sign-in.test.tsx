// @vitest-environment happy-dom
import { fakeCore, type Routes } from "@internal/core-client/fake-core";
import { cleanup, render, screen } from "@testing-library/react";
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

/**
 * Stubs `fetch` with core, whose session starts as `session` and whose code
 * `K7XQ2` signs Grandma in. Returns each call core got, as `METHOD /path`.
 */
function coreWith(session: object, routes: Routes = {}): string[] {
  let current = session;
  const calls: string[] = [];
  const answer = fakeCore(core, {
    "GET /session": () => ({ body: current }),
    "GET /launcher": () => ({ body: { apps: [] } }),
    "POST /login/code": ({ body }) => {
      if (JSON.stringify(body) !== JSON.stringify({ code: "K7XQ2" })) {
        return { status: 401, body: { error: "That code doesn't work." } };
      }
      current = guest;
      return { body: guest };
    },
    ...routes,
  });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(`${request.method} ${new URL(request.url).pathname}`);
    return answer(input, init);
  });
  return calls;
}

/** Opens the hub's page at `path`. */
function openAt(path: string): void {
  history.replaceState(null, "", path);
  render(<App />);
}

function signedInAs(): Promise<string | null> {
  return screen.findByText("Signed in as").then((line) => line.textContent);
}

beforeEach(() => {
  // callCore reports a failed call to the console; some tests fail calls on
  // purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("an intro link", () => {
  it("asks a signed-in viewer first, and sends core no sign-in", async () => {
    const calls = coreWith(owner);
    openAt("/i/K7XQ2");

    const question = await screen.findByRole("heading", {
      name: "Sign in with this link instead?",
    });

    expect(question.parentElement?.textContent).toContain(
      "You're signed in as rob.",
    );
    expect(calls).toEqual(["GET /session"]);
    expect(location.pathname).toBe("/");
  });

  it("leaves the session as it was when the viewer says no", async () => {
    const calls = coreWith(owner);
    const viewer = userEvent.setup();
    openAt("/i/K7XQ2");

    await viewer.click(
      await screen.findByRole("button", { name: "Stay signed in as rob" }),
    );

    expect(await signedInAs()).toBe("Signed in as rob");
    expect(calls).not.toContain("POST /login/code");
  });

  it("signs in once with the link when the viewer says yes", async () => {
    const calls = coreWith(owner);
    const viewer = userEvent.setup();
    openAt("/i/K7XQ2");

    await viewer.click(
      await screen.findByRole("button", { name: "Sign in with the link" }),
    );

    expect(await signedInAs()).toBe("Signed in as Grandma");
    expect(calls.filter((call) => call === "POST /login/code")).toHaveLength(1);
  });

  it("keeps asking, with core's sentence, when the link's code doesn't work", async () => {
    coreWith(owner);
    const viewer = userEvent.setup();
    openAt("/i/NOPE1");

    await viewer.click(
      await screen.findByRole("button", { name: "Sign in with the link" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code doesn't work.",
    );
    expect(
      screen.getByRole("button", { name: "Stay signed in as rob" }),
    ).toBeDefined();
  });

  it("signs in a browser that isn't signed in, without asking", async () => {
    const calls = coreWith({ state: "signed-out" });
    openAt("/i/K7XQ2");

    expect(await signedInAs()).toBe("Signed in as Grandma");
    expect(calls).toContain("POST /login/code");
    expect(
      screen.queryByRole("heading", {
        name: "Sign in with this link instead?",
      }),
    ).toBeNull();
  });

  it("shows the sign-in form with core's sentence when the code doesn't work", async () => {
    coreWith({ state: "signed-out" });
    openAt("/i/NOPE1");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code doesn't work.",
    );
    expect(screen.getByLabelText("Access code")).toBeDefined();
  });
});
