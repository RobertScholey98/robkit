import type { AccessRule, RoleId, Viewer } from "@robkit/guard";
import { describe, expectTypeOf, it } from "vitest";
import {
  requestGuard,
  type AccessRuleFailure,
  type GuardedOptions,
  type GuardFault,
  type RequestDecision,
} from "./index.ts";
import {
  readSlug,
  type CoreOrigin,
  type DeclaredAccess,
  type InputProblem,
  type Slug,
} from "@robkit/input";
import { readSessionLapsed, type SessionLapsed } from "./lapsed.ts";

declare const notes: Slug;
declare const family: RoleId;
declare const core: CoreOrigin;
const options = (value: GuardedOptions) => value;
const declared = (value: DeclaredAccess) => value;
const rule = (value: AccessRule) => value;
const fault = (value: GuardFault) => value;

describe("session's types", () => {
  it("guards a request into a viewer or an answer", () => {
    expectTypeOf(requestGuard({ app: notes, core })).toEqualTypeOf<
      (request: Request) => Promise<RequestDecision>
    >();
    expectTypeOf<RequestDecision>().toEqualTypeOf<
      { viewer: Viewer } | { response: Response }
    >();
  });

  it("takes the app as a Slug, which only readSlug makes", () => {
    expectTypeOf(readSlug).parameter(0).toBeUnknown();
    expectTypeOf(readSlug).returns.toEqualTypeOf<Slug | InputProblem>();
    // The platform's own apps need no reading.
    options({ app: "admin", core, access: { kind: "owner" } });
    // @ts-expect-error A plain string hasn't been read as a slug.
    options({ app: "notes", core });
    // @ts-expect-error Nor has a string from anywhere else.
    options({ app: String(notes), core });
    // @ts-expect-error The guard needs core's origin.
    options({ app: notes });
  });

  it("takes core's origin only as readCoreUrl made it", () => {
    expectTypeOf<GuardedOptions["core"]>().toEqualTypeOf<CoreOrigin>();
    // @ts-expect-error A plain string hasn't been read as core's origin.
    options({ app: notes, core: "http://core.robkit.localhost:3000" });
  });

  it("says how core's answer failed only for the access rule", () => {
    expectTypeOf<AccessRuleFailure>().toEqualTypeOf<
      "unknown-app" | "bad-answer" | "invalid-json" | "interrupted-body"
    >();
    fault({
      app: notes,
      failed: "access-rule",
      reason: "unknown-app",
      cause: 1,
    });
    // @ts-expect-error An access-rule fault says which way it failed.
    fault({ app: notes, failed: "access-rule", cause: 1 });
    // @ts-expect-error A fault reaching core has no answer to have failed.
    fault({ app: notes, failed: "network", reason: "unknown-app", cause: 1 });
  });

  it("keeps role names apart from the guard's role ids", () => {
    declared({ kind: "roles", roleNames: ["Family"] });
    rule({ kind: "roles", roles: [family] });
    // @ts-expect-error A manifest's rule names roles; it doesn't hold ids.
    declared({ kind: "roles", roles: ["Family"] });
    // @ts-expect-error The guard's rule holds role ids, not names.
    rule({ kind: "roles", roleNames: ["Family"] });
  });

  it("reads a lapsed session from any response", () => {
    expectTypeOf(readSessionLapsed).parameter(0).toEqualTypeOf<Response>();
    expectTypeOf(readSessionLapsed).returns.resolves.toEqualTypeOf<
      SessionLapsed | undefined
    >();
    expectTypeOf<SessionLapsed["outcome"]>().toEqualTypeOf<
      "login" | "refresh"
    >();
  });
});
