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
  sessionStorage.clear();
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

describe("next", () => {
  const notes = "https://notes.robkit.test/page?x=1";
  const toNotes = `/?next=${encodeURIComponent(notes)}`;

  /** Stubs `location.assign`, and returns where the hub sent the browser. */
  function forwards(): string[] {
    const sent: string[] = [];
    vi.spyOn(location, "assign").mockImplementation((url) => {
      sent.push(String(url));
    });
    return sent;
  }

  it("sends a signed-in visitor to the app it names", async () => {
    const calls = coreWith(owner);
    const sent = forwards();
    openAt(toNotes);

    await vi.waitFor(() => {
      expect(sent).toEqual([notes]);
    });
    expect(calls).toEqual(["GET /session"]);
    expect(screen.queryByText("Signed in as")).toBeNull();
  });

  it.each([
    ["another site", "https://evil.com/"],
    ["a look-alike domain", "https://notes.robkit.test.evil.com/"],
    ["an app over http", "http://notes.robkit.test/"],
  ])("keeps a signed-in visitor on the launcher for %s", async (_, next) => {
    coreWith(owner);
    const sent = forwards();
    openAt(`/?next=${encodeURIComponent(next)}`);

    expect(await signedInAs()).toBe("Signed in as rob");
    expect(sent).toEqual([]);
  });

  it("shows the launcher, and says why, when the app sends the visitor back", async () => {
    coreWith(owner);
    const sent = forwards();
    openAt(toNotes);
    await vi.waitFor(() => {
      expect(sent).toEqual([notes]);
    });
    cleanup();

    openAt(toNotes);

    expect(await signedInAs()).toBe("Signed in as rob");
    expect(screen.getByRole("status").textContent).toBe(
      "notes.robkit.test sent you straight back here. Try opening it again below.",
    );
    expect(sent).toEqual([notes]);
  });

  it("keeps a signed-in visitor on the launcher when the tab's storage refuses", async () => {
    coreWith(owner);
    const sent = forwards();
    const refuse = () => {
      throw new DOMException("Storage is off.", "SecurityError");
    };
    vi.stubGlobal("sessionStorage", { getItem: refuse, setItem: refuse });
    openAt(toNotes);

    expect(await signedInAs()).toBe("Signed in as rob");
    expect(sent).toEqual([]);
  });

  it("still forwards to another app after one sent the visitor back", async () => {
    coreWith(owner);
    const sent = forwards();
    openAt(toNotes);
    await vi.waitFor(() => {
      expect(sent).toEqual([notes]);
    });
    cleanup();

    openAt("/?next=https%3A%2F%2Fadmin.robkit.test%2F");

    await vi.waitFor(() => {
      expect(sent).toEqual([notes, "https://admin.robkit.test/"]);
    });
  });

  it("sends a visitor who signs in to the app, and not again when it sends them back", async () => {
    coreWith(
      { state: "signed-out" },
      { "POST /login": () => ({ body: owner }) },
    );
    const sent = forwards();
    const viewer = userEvent.setup();
    openAt(toNotes);
    await viewer.click(
      await screen.findByRole("button", { name: "I'm the owner" }),
    );
    await viewer.type(screen.getByLabelText("Username"), "rob");
    await viewer.type(screen.getByLabelText("Password"), "correct horse");
    await viewer.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => {
      expect(sent).toEqual([notes]);
    });
    cleanup();

    coreWith(owner);
    openAt(toNotes);

    expect(await signedInAs()).toBe("Signed in as rob");
    expect(screen.getByRole("status").textContent).toContain(
      "sent you straight back here",
    );
    expect(sent).toEqual([notes]);
  });
});
