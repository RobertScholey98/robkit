import { describe, expectTypeOf, it } from "vitest";
import {
  guard,
  readAccessRule,
  readCodeId,
  readRoleId,
  type AccessRule,
  type CodeId,
  type Decision,
  type RoleId,
  type SessionState,
  type Viewer,
} from "./index.ts";

declare const family: RoleId;
declare const grandma: CodeId;

const rule = (value: AccessRule) => value;
const session = (value: SessionState) => value;

describe("the guard's types", () => {
  it("decides from a rule and a session state", () => {
    expectTypeOf(guard).parameters.toEqualTypeOf<[AccessRule, SessionState]>();
    expectTypeOf(guard).returns.toEqualTypeOf<Decision>();
  });

  it("hands over a viewer only when it lets the request in", () => {
    const decision = guard({ kind: "open" }, { state: "signed-out" });
    if (decision.outcome === "allow") {
      expectTypeOf(decision.viewer).toEqualTypeOf<Viewer>();
    } else {
      expectTypeOf(decision).not.toHaveProperty("viewer");
    }
  });

  it("reads JSON it can't trust as a rule or nothing", () => {
    expectTypeOf(readAccessRule).parameter(0).toBeUnknown();
    expectTypeOf(readAccessRule).returns.toEqualTypeOf<
      AccessRule | undefined
    >();
  });

  it("refuses a rule or session that can't be", () => {
    // @ts-expect-error A roles rule needs the role ids it lets in.
    rule({ kind: "roles" });
    // @ts-expect-error An open rule takes no roles.
    rule({ kind: "open", roles: [family] });
    // @ts-expect-error There is no such kind of rule.
    rule({ kind: "everyone" });
    // @ts-expect-error A signed-in session says who is signed in.
    session({ state: "signed-in" });
    // @ts-expect-error A guest holds roles.
    session({ state: "signed-in", viewer: { kind: "guest", id: grandma } });
  });

  it("makes role and code ids only by reading them", () => {
    expectTypeOf(readRoleId).parameter(0).toBeUnknown();
    expectTypeOf(readRoleId).returns.toEqualTypeOf<RoleId | undefined>();
    expectTypeOf(readCodeId).parameter(0).toBeUnknown();
    expectTypeOf(readCodeId).returns.toEqualTypeOf<CodeId | undefined>();
    rule({ kind: "roles", roles: [family] });
    session({
      state: "signed-in",
      viewer: { kind: "guest", id: grandma, roles: [family] },
    });
    // @ts-expect-error A plain string hasn't been read as a role id.
    rule({ kind: "roles", roles: ["r1"] });
    // @ts-expect-error A code's id isn't a role's.
    rule({ kind: "roles", roles: [grandma] });
    session({
      state: "signed-in",
      // @ts-expect-error A guest is named by their code's id, not a string.
      viewer: { kind: "guest", id: "g1", roles: [family] },
    });
    session({
      state: "signed-in",
      // @ts-expect-error A guest holds role ids, not code ids.
      viewer: { kind: "guest", id: grandma, roles: [grandma] },
    });
  });
});
