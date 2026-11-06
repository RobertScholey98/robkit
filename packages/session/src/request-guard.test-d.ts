import type { AccessRule, RoleId, Viewer } from "@robkit/guard";
import { describe, expectTypeOf, it } from "vitest";
import {
  requestGuard,
  type GuardedOptions,
  type RequestDecision,
} from "./index.ts";
import type { DeclaredAccess, InputProblem } from "./input.ts";
import { readSlug, type Slug } from "./install-addresses.ts";
import { readSessionLapsed, type SessionLapsed } from "./session-lapsed.ts";

declare const notes: Slug;
declare const family: RoleId;
const core = "http://core.robkit.localhost:3000";
const options = (value: GuardedOptions) => value;
const declared = (value: DeclaredAccess) => value;
const rule = (value: AccessRule) => value;

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
