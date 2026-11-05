import { describe, expectTypeOf, it } from "vitest";
import {
  guard,
  readAccessRule,
  type AccessRule,
  type Decision,
  type SessionState,
  type Viewer,
} from "./index.ts";

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
    rule({ kind: "open", roles: ["r1"] });
    // @ts-expect-error There is no such kind of rule.
    rule({ kind: "everyone" });
    // @ts-expect-error A signed-in session says who is signed in.
    session({ state: "signed-in" });
    // @ts-expect-error A guest holds roles.
    session({ state: "signed-in", viewer: { kind: "guest", id: "g1" } });
  });
});
