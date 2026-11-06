import { fakeCore, unreachable } from "@internal/core-client/fake-core";
import { readRoleId } from "@robkit/guard";
import { orThrow } from "@robkit/input";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRole,
  listApps,
  listRoles,
  setAccess,
  setRoleCodes,
  type AccessRule,
} from "./access-api.ts";

const core = "https://core.example.com";
const family = { id: "r_1", name: "Family", codeIds: ["c_1", "c_2"] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** What callCore's default report printed, a call each. */
function printed(): unknown[][] {
  const calls: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    calls.push(args);
  });
  return calls;
}

describe("listRoles", () => {
  it("reads every role and the codes that hold it", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /roles": () => ({ body: { roles: [family] } }) }),
    );

    expect(await listRoles(core)).toEqual({ outcome: "ok", value: [family] });
  });

  it("refuses a role it can't read, and reports why", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "GET /roles": () => ({
          body: { roles: [{ ...family, codeIds: "c_1" }] },
        }),
      }),
    );
    const reported = printed();

    expect(await listRoles(core)).toEqual({
      outcome: "failed",
      error: "Core sent an answer this page can't read.",
    });
    expect(reported).toEqual([
      [
        `Core at ${core} answered GET /roles with 200, which this page can't read: Item 1 of the roles field: The codeIds field isn't a list.`,
      ],
    ]);
  });
});

describe("createRole", () => {
  it("sends the name and the ticked codes, and reads the new role", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /roles": ({ body }) => ({
          status: 201,
          body: { id: "r_1", ...(body as object) },
        }),
      }),
    );

    const result = await createRole(core, {
      name: "Family",
      codeIds: ["c_1", "c_2"],
    });

    expect(result).toEqual({ outcome: "ok", value: family });
  });

  it("passes on core's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /roles": () => ({
          status: 409,
          body: { error: "There's a role with that name." },
        }),
      }),
    );

    expect(await createRole(core, { name: "Family", codeIds: [] })).toEqual({
      outcome: "failed",
      error: "There's a role with that name.",
    });
  });
});

describe("setRoleCodes", () => {
  it("sends the codes that should hold the role, and reads the role", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /roles/r%2F1/codes": ({ body }) => ({
          body: { ...family, ...(body as object) },
        }),
      }),
    );

    expect(await setRoleCodes(core, "r/1", ["c_2"])).toEqual({
      outcome: "ok",
      value: { ...family, codeIds: ["c_2"] },
    });
  });
});

describe("listApps", () => {
  it("reads each app and its rule", async () => {
    const apps = [
      { slug: "example", name: "example", access: { kind: "owner" } },
      {
        slug: "notes",
        name: "notes",
        access: { kind: "roles", roles: ["r_1"] },
      },
    ];
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /apps": () => ({ body: { apps } }) }),
    );

    expect(await listApps(core)).toEqual({ outcome: "ok", value: apps });
  });

  it("refuses an app whose rule it can't read", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "GET /apps": () => ({
          body: {
            apps: [
              { slug: "example", name: "example", access: { kind: "all" } },
            ],
          },
        }),
      }),
    );

    expect(await listApps(core)).toEqual({
      outcome: "failed",
      error: "Core sent an answer this page can't read.",
    });
  });
});

describe("setAccess", () => {
  it("sends the app's new rule, and reads the rule core kept", async () => {
    const family = orThrow(readRoleId("r_1"));
    const rule: AccessRule = { kind: "roles", roles: [family] };
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /apps/example/access": ({ body }) => ({ body }),
      }),
    );

    expect(await setAccess(core, "example", rule)).toEqual({
      outcome: "ok",
      value: rule,
    });
  });

  it("passes on core's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /apps/example/access": () => ({
          status: 400,
          body: { error: "That role doesn't exist." },
        }),
      }),
    );

    expect(await setAccess(core, "example", { kind: "owner" })).toEqual({
      outcome: "failed",
      error: "That role doesn't exist.",
    });
  });
});

describe("every call", () => {
  it.each([
    ["listRoles", () => listRoles(core)],
    ["createRole", () => createRole(core, { name: "Family", codeIds: [] })],
    ["setRoleCodes", () => setRoleCodes(core, "r_1", [])],
    ["listApps", () => listApps(core)],
    ["setAccess", () => setAccess(core, "example", { kind: "owner" })],
  ])("%s says when core can't be reached", async (_, call) => {
    vi.stubGlobal("fetch", unreachable);

    expect(await call()).toEqual({
      outcome: "failed",
      error: "Couldn't reach core at https://core.example.com.",
    });
  });
});
