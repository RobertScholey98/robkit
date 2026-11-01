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

function coreAnswers(status: number, body?: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function posted(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listRoles", () => {
  it("reads every role and the codes that hold it", async () => {
    const fetch = coreAnswers(200, { roles: [family] });

    expect(await listRoles(core)).toEqual({ ok: true, value: [family] });
    expect(fetch.mock.calls).toEqual([
      [`${core}/roles`, { method: "GET", credentials: "include" }],
    ]);
  });

  it("refuses a role it can't read", async () => {
    coreAnswers(200, { roles: [{ ...family, codeIds: "c_1" }] });

    expect(await listRoles(core)).toEqual({
      ok: false,
      error: "Core sent an answer admin can't read.",
    });
  });
});

describe("createRole", () => {
  it("sends the name and the ticked codes", async () => {
    const fetch = coreAnswers(201, family);

    const result = await createRole(core, {
      name: "Family",
      codeIds: ["c_1", "c_2"],
    });

    expect(result).toEqual({ ok: true, value: family });
    expect(fetch.mock.calls).toEqual([
      [`${core}/roles`, posted({ name: "Family", codeIds: ["c_1", "c_2"] })],
    ]);
  });

  it("passes on core's refusal", async () => {
    coreAnswers(409, { error: "There's a role with that name." });

    expect(await createRole(core, { name: "Family", codeIds: [] })).toEqual({
      ok: false,
      error: "There's a role with that name.",
    });
  });
});

describe("setRoleCodes", () => {
  it("sends the codes that should hold the role", async () => {
    const fetch = coreAnswers(200, { ...family, codeIds: ["c_2"] });

    const result = await setRoleCodes(core, "r/1", ["c_2"]);

    expect(result).toEqual({
      ok: true,
      value: { ...family, codeIds: ["c_2"] },
    });
    expect(fetch.mock.calls).toEqual([
      [`${core}/roles/r%2F1/codes`, posted({ codeIds: ["c_2"] })],
    ]);
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
    coreAnswers(200, { apps });

    expect(await listApps(core)).toEqual({ ok: true, value: apps });
  });

  it("refuses an app whose rule it can't read", async () => {
    coreAnswers(200, {
      apps: [{ slug: "example", name: "example", access: { kind: "all" } }],
    });

    expect((await listApps(core)).ok).toBe(false);
  });
});

describe("setAccess", () => {
  it("sends the app's new rule", async () => {
    const rule: AccessRule = { kind: "roles", roles: ["r_1"] };
    const fetch = coreAnswers(200, rule);

    expect(await setAccess(core, "example", rule)).toEqual({
      ok: true,
      value: rule,
    });
    expect(fetch.mock.calls).toEqual([
      [`${core}/apps/example/access`, posted(rule)],
    ]);
  });
});
