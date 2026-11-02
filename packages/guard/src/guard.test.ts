import { describe, expect, it } from "vitest";
import { conformanceCases, type ConformanceCase } from "./conformance.ts";
import { guard, type SessionState, type Viewer } from "./index.ts";

function viewerOf({
  session,
  guestRoles = [],
}: ConformanceCase): Viewer | undefined {
  switch (session) {
    case "signed-out":
      return { kind: "nobody" };
    case "expired":
      return undefined;
    case "owner":
      return { kind: "owner", id: "owner-1" };
    case "guest":
      return { kind: "guest", id: "code-1", roles: guestRoles };
  }
}

function sessionOf(asking: ConformanceCase): SessionState {
  const viewer = viewerOf(asking);
  if (asking.session === "signed-out" || asking.session === "expired") {
    return { state: asking.session };
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
