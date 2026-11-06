import { describe, expect, it } from "vitest";
import { conformanceCases, type ConformanceCase } from "./conformance.ts";
import {
  guard,
  readAccessRule,
  readCodeId,
  readRoleId,
  readRoleIds,
  type CodeId,
  type SessionState,
  type Viewer,
} from "./index.ts";

// The guard's own reader makes the test guest's code id. @internal/test-session
// has builders for the packages above the guard, but it depends on the guard.
function aCodeId(id: string): CodeId {
  const read = readCodeId(id);
  if (read === undefined) throw new Error(`${id} isn't a code id.`);
  return read;
}

const guestId = aCodeId("code-1");

function viewerOf({
  session,
  guestRoles = [],
}: ConformanceCase): Viewer | undefined {
  switch (session) {
    case "signed-out":
      return { kind: "nobody" };
    case "unknown":
    case "expired":
      return undefined;
    case "owner":
      return { kind: "owner", id: "owner-1" };
    case "guest":
      return { kind: "guest", id: guestId, roles: guestRoles };
  }
}

function sessionOf(asking: ConformanceCase): SessionState {
  const viewer = viewerOf(asking);
  const { session } = asking;
  if (
    session === "unknown" ||
    session === "signed-out" ||
    session === "expired"
  ) {
    return { state: session };
  }
  if (viewer === undefined || viewer.kind === "nobody") {
    throw new Error(`no viewer for ${asking.session}`);
  }
  return { state: "signed-in", viewer };
}

describe("guard", () => {
  it.each(conformanceCases)("$name", (asking) => {
    expect(guard(asking.rule, sessionOf(asking))).toEqual(
      asking.outcome === "allow"
        ? { outcome: "allow", viewer: viewerOf(asking) }
        : { outcome: asking.outcome },
    );
  });

  it("lets the owner into an owner-only app as themselves", () => {
    expect(
      guard(
        { kind: "owner" },
        { state: "signed-in", viewer: { kind: "owner", id: "abc" } },
      ),
    ).toEqual({ outcome: "allow", viewer: { kind: "owner", id: "abc" } });
  });
});

describe("readAccessRule", () => {
  it.each([
    { kind: "open" },
    { kind: "owner" },
    { kind: "roles", roles: ["role-1", "role-2"] },
  ])("reads %j", (rule) => {
    expect(readAccessRule(JSON.parse(JSON.stringify(rule)))).toEqual(rule);
  });

  it("keeps only what a rule needs", () => {
    expect(readAccessRule({ kind: "open", roles: ["role-1"] })).toEqual({
      kind: "open",
    });
  });

  it.each([
    null,
    "open",
    {},
    { kind: "everyone" },
    { kind: "roles" },
    { kind: "roles", roles: "role-1" },
    { kind: "roles", roles: ["role-1", 2] },
    { kind: "roles", roles: ["role-1", ""] },
  ])("refuses %j", (value) => {
    expect(readAccessRule(value)).toBeUndefined();
  });
});

describe("the id readers", () => {
  it("read a string that isn't empty as an id", () => {
    expect(readRoleId("role-1")).toBe("role-1");
    expect(readCodeId("code-1")).toBe("code-1");
    expect(readRoleIds(["role-1", "role-2"])).toEqual(["role-1", "role-2"]);
    expect(readRoleIds([])).toEqual([]);
  });

  it.each([undefined, null, "", 1, ["role-1"], {}])("refuse %j", (value) => {
    expect(readRoleId(value)).toBeUndefined();
    expect(readCodeId(value)).toBeUndefined();
  });

  it.each([undefined, "role-1", ["role-1", 2], [""]])(
    "refuse %j as a list of role ids",
    (value) => {
      expect(readRoleIds(value)).toBeUndefined();
    },
  );
});
