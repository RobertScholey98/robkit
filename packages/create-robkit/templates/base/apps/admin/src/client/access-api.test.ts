import { fakeCore, unreachable } from "@internal/core-client/fake-core";
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
});

describe("listRoles", () => {
  it("reads every role and the codes that hold it", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, { "GET /roles": () => ({ body: { roles: [family] } }) }),
    );

    expect(await listRoles(core)).toEqual({ ok: true, value: [family] });
  });

  it("refuses a role it can't read", async () => {
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "GET /roles": () => ({
          body: { roles: [{ ...family, codeIds: "c_1" }] },
        }),
      }),
    );

    expect(await listRoles(core)).toEqual({
      ok: false,
      error: "Core sent an answer this page can't read.",
    });
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

    expect(result).toEqual({ ok: true, value: family });
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
      ok: false,
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
      ok: true,
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

    expect(await listApps(core)).toEqual({ ok: true, value: apps });
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
      ok: false,
      error: "Core sent an answer this page can't read.",
    });
  });
});

describe("setAccess", () => {
  it("sends the app's new rule, and reads the rule core kept", async () => {
    const rule: AccessRule = { kind: "roles", roles: ["r_1"] };
    vi.stubGlobal(
      "fetch",
      fakeCore(core, {
        "POST /apps/example/access": ({ body }) => ({ body }),
      }),
    );

    expect(await setAccess(core, "example", rule)).toEqual({
      ok: true,
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
      ok: false,
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
      ok: false,
      error: "Couldn't reach core at https://core.example.com.",
    });
  });
});
