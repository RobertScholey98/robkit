// @vitest-environment happy-dom
import { fakeCore, type Routes } from "@internal/core-client/fake-core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Admin } from "./Admin.tsx";

const core = "https://core.robkit.test";

/** A code as core lists it, live and with no expiry. */
function aCode(id: string, name: string, code: string) {
  return {
    id,
    code,
    name,
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-11-01T12:00:00.000Z",
    standing: "live",
  };
}

interface Held {
  codes: ReturnType<typeof aCode>[];
  roles: { id: string; name: string; codeIds: string[] }[];
}

/**
 * Stubs `fetch` with core holding `held`, which its POST routes change as
 * core's would. `routes` replaces any of them, such as to refuse a call.
 * Answers with what each call posted, in order.
 */
function coreHolding(held: Held, routes: Routes = {}): unknown[] {
  const posted: unknown[] = [];
  const defaults: Routes = {
    "GET /codes": () => ({ body: { codes: held.codes } }),
    "POST /codes": ({ body }) => {
      const name = isNamed(body) ? body.name : "";
      const code = aCode(`c_${String(held.codes.length + 1)}`, name, "K7XQ2");
      held.codes.push(code);
      return { status: 201, body: code };
    },
    "GET /roles": () => ({ body: { roles: held.roles } }),
    "POST /roles": ({ body }) => {
      const role = {
        id: `r_${String(held.roles.length + 1)}`,
        name: isNamed(body) ? body.name : "",
        codeIds: codeIdsOf(body),
      };
      held.roles.push(role);
      return { status: 201, body: role };
    },
    "GET /apps": () => ({ body: { apps: [] } }),
    ...Object.fromEntries(
      held.roles.map((role) => [
        `POST /roles/${role.id}/codes`,
        ({ body }: { body: unknown }) => {
          role.codeIds = codeIdsOf(body);
          return { body: role };
        },
      ]),
    ),
  };
  const all: Routes = { ...defaults, ...routes };
  vi.stubGlobal(
    "fetch",
    fakeCore(
      core,
      Object.fromEntries(
        Object.entries(all).map(([path, answer]) => [
          path,
          (call) => {
            if (call.request.method === "POST") posted.push(call.body);
            return answer(call);
          },
        ]),
      ),
    ),
  );
  return posted;
}

function isNamed(body: unknown): body is { name: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof body.name === "string"
  );
}

function codeIdsOf(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("codeIds" in body)) {
    return [];
  }
  const { codeIds } = body;
  return Array.isArray(codeIds)
    ? codeIds.filter((id) => typeof id === "string")
    : [];
}

beforeEach(() => {
  // callCore reports a failed call to the console; these tests fail calls
  // on purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the mint form", () => {
  it("mints a code for the guest and lists it", async () => {
    const posted = coreHolding({ codes: [], roles: [] });
    const owner = userEvent.setup();
    render(<Admin core={core} />);
    const codes = await screen.findByRole("table");

    await owner.type(screen.getByLabelText("Guest's name"), "Grandma");
    await owner.click(screen.getByRole("button", { name: "Mint code" }));

    expect(await within(codes).findByText("Grandma")).toBeDefined();
    expect(within(codes).getByTestId("intro-link").textContent).toBe(
      "https://hub.robkit.test/i/K7XQ2",
    );
    expect(posted).toEqual([{ name: "Grandma" }]);
    expect(screen.getByLabelText<HTMLInputElement>("Guest's name").value).toBe(
      "",
    );
  });

  it("shows core's refusal and keeps what the owner typed", async () => {
    coreHolding(
      { codes: [], roles: [] },
      {
        "POST /codes": () => ({
          status: 409,
          body: { error: "That code is already taken." },
        }),
      },
    );
    const owner = userEvent.setup();
    render(<Admin core={core} />);
    await screen.findByRole("table");

    await owner.type(screen.getByLabelText("Guest's name"), "Grandma");
    await owner.type(screen.getByLabelText("Code"), "TAKEN");
    await owner.click(screen.getByRole("button", { name: "Mint code" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code is already taken.",
    );
    expect(screen.getByLabelText<HTMLInputElement>("Guest's name").value).toBe(
      "Grandma",
    );
  });

  it("says so when core can't be reached to list codes", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    render(<Admin core={core} />);

    const alerts = await screen.findAllByRole("alert");

    expect(alerts.map((alert) => alert.textContent)).toEqual([
      `Couldn't reach core at ${core}.`,
      `Couldn't reach core at ${core}.`,
    ]);
  });
});

describe("the role forms", () => {
  const guests = () => [
    aCode("c_1", "Alex", "AAAAA"),
    aCode("c_2", "Sam", "BBBBB"),
  ];

  it("creates a role held by the guests the owner ticks", async () => {
    const posted = coreHolding({ codes: guests(), roles: [] });
    const owner = userEvent.setup();
    render(<Admin core={core} />);
    const form = await screen.findByRole("form", { name: "Create a role" });

    await owner.type(within(form).getByLabelText("Role name"), "Family");
    await owner.click(within(form).getByRole("checkbox", { name: /Alex/ }));
    await owner.click(within(form).getByRole("checkbox", { name: /Sam/ }));
    await owner.click(
      within(form).getByRole("button", { name: "Create role" }),
    );

    const family = await screen.findByRole("listitem", { name: "Family" });
    expect(within(family).getByText("Alex, Sam")).toBeDefined();
    expect(posted).toEqual([{ name: "Family", codeIds: ["c_1", "c_2"] }]);
  });

  it("shows core's refusal of a new role", async () => {
    coreHolding(
      { codes: guests(), roles: [] },
      {
        "POST /roles": () => ({
          status: 409,
          body: { error: "There's already a role called Family." },
        }),
      },
    );
    const owner = userEvent.setup();
    render(<Admin core={core} />);
    const form = await screen.findByRole("form", { name: "Create a role" });

    await owner.type(within(form).getByLabelText("Role name"), "Family");
    await owner.click(
      within(form).getByRole("button", { name: "Create role" }),
    );

    expect((await within(form).findByRole("alert")).textContent).toBe(
      "There's already a role called Family.",
    );
    expect(screen.queryByRole("listitem", { name: "Family" })).toBeNull();
  });

  it("changes which guests hold a role", async () => {
    const posted = coreHolding({
      codes: guests(),
      roles: [{ id: "r_1", name: "Family", codeIds: ["c_1"] }],
    });
    const owner = userEvent.setup();
    render(<Admin core={core} />);
    const family = await screen.findByRole("listitem", { name: "Family" });
    expect(within(family).getByText("Alex")).toBeDefined();

    await owner.click(
      within(family).getByRole("button", { name: "Edit guests" }),
    );
    await owner.click(within(family).getByRole("checkbox", { name: /Alex/ }));
    await owner.click(within(family).getByRole("checkbox", { name: /Sam/ }));
    await owner.click(
      within(family).getByRole("button", { name: "Save guests" }),
    );

    expect(await within(family).findByText("Sam")).toBeDefined();
    expect(
      within(family).queryByRole("button", { name: "Save guests" }),
    ).toBeNull();
    expect(posted).toEqual([{ codeIds: ["c_2"] }]);
  });

  it("shows core's refusal of a role's guests and keeps the picker open", async () => {
    coreHolding(
      {
        codes: guests(),
        roles: [{ id: "r_1", name: "Family", codeIds: ["c_1"] }],
      },
      {
        "POST /roles/r_1/codes": () => ({
          status: 404,
          body: { error: "That role no longer exists." },
        }),
      },
    );
    const owner = userEvent.setup();
    render(<Admin core={core} />);
    const family = await screen.findByRole("listitem", { name: "Family" });

    await owner.click(
      within(family).getByRole("button", { name: "Edit guests" }),
    );
    await owner.click(
      within(family).getByRole("button", { name: "Save guests" }),
    );

    expect((await within(family).findByRole("alert")).textContent).toBe(
      "That role no longer exists.",
    );
    expect(
      within(family).getByRole("button", { name: "Save guests" }),
    ).toBeDefined();
  });
});

describe("a code's row", () => {
  const grandma = () => aCode("c_1", "Grandma", "K7XQ2");

  it("copies the code's link", async () => {
    coreHolding({ codes: [grandma()], roles: [] });
    // Testing Library's setup puts a clipboard of its own on the page.
    const owner = userEvent.setup();
    const copied = vi.spyOn(navigator.clipboard, "writeText");
    render(<Admin core={core} />);

    await owner.click(await screen.findByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeDefined();
    expect(copied).toHaveBeenCalledWith("https://hub.robkit.test/i/K7XQ2");
  });

  it("says so when the browser refuses the clipboard", async () => {
    coreHolding({ codes: [grandma()], roles: [] });
    const owner = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new DOMException("Write permission denied.", "NotAllowedError"),
    );
    render(<Admin core={core} />);

    await owner.click(await screen.findByRole("button", { name: "Copy" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't copy the link. Select it and copy it yourself.",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
  });
});
