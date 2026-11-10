import type { AccessRule, RoleId, Viewer } from "@robkit/guard";
import { describe, expectTypeOf, it } from "vitest";
import {
  appOrigin,
  requestGuard,
  type AccessRuleFailure,
  type GuardedOptions,
  type GuardFault,
  type RequestDecision,
} from "./index.ts";
import type { CoreOrigin, Slug } from "@robkit/input";
import { type ManifestAccess } from "@robkit/input/manifest";
import { readSessionLapsed, type SessionLapsed } from "./lapsed.ts";

declare const notes: Slug;
declare const family: RoleId;
declare const core: CoreOrigin;
const options = (value: GuardedOptions) => value;
const declared = (value: ManifestAccess) => value;
const rule = (value: AccessRule) => value;
const fault = (value: GuardFault) => value;

describe("session's types", () => {
  it("guards a request into a viewer or an answer", () => {
    expectTypeOf(requestGuard({ app: notes, core })).toEqualTypeOf<
      (request: Request) => Promise<RequestDecision>
    >();
    expectTypeOf<RequestDecision>().toEqualTypeOf<
      | {
          outcome: "serve";
          viewer: Viewer;
          headers: readonly [string, string][];
        }
      | { outcome: "answer"; response: Response }
    >();
  });

  it("works out the app's origin from the settings it's given or reads", () => {
    expectTypeOf(appOrigin()).toBeString();
    expectTypeOf(appOrigin({ app: notes, core })).toBeString();
    expectTypeOf(
      appOrigin({ app: "notes", core: "https://core.robkit.dev" }),
    ).toBeString();
  });

  it("needs no options, since it reads its settings itself", () => {
    expectTypeOf(requestGuard()).toEqualTypeOf<
      (request: Request) => Promise<RequestDecision>
    >();
    options({});
    options({ access: { kind: "owner" } });
  });

  it("takes the app and core's origin as plain strings, or as read", () => {
    expectTypeOf<GuardedOptions["app"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<GuardedOptions["core"]>().toEqualTypeOf<string | undefined>();
    options({ app: "notes", core: "http://core.robkit.localhost:3000" });
    options({ app: notes, core });
    // @ts-expect-error A slug is text.
    options({ app: 1 });
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

  it("names the guard's app by its slug when it can't check a request", () => {
    expectTypeOf<GuardFault["app"]>().toEqualTypeOf<Slug>();
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
