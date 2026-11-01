import { describe, expect, it } from "vitest";
import { conformanceCases, type ConformanceCase } from "./conformance.ts";
import { guard, type SessionState, type Viewer } from "./index.ts";

const sessions: Record<ConformanceCase["session"], SessionState> = {
  "signed-out": { state: "signed-out" },
  expired: { state: "expired" },
  owner: { state: "signed-in", viewer: { kind: "owner", id: "owner-1" } },
  guest: { state: "signed-in", viewer: { kind: "guest", id: "code-1" } },
};

const viewers: Record<ConformanceCase["session"], Viewer | undefined> = {
  "signed-out": { kind: "nobody" },
  expired: undefined,
  owner: { kind: "owner", id: "owner-1" },
  guest: { kind: "guest", id: "code-1" },
};

describe("guard", () => {
  it.each(conformanceCases)("$name", ({ rule, session, outcome }) => {
    expect(guard(rule, sessions[session])).toEqual(
      outcome === "allow" ? { outcome, viewer: viewers[session] } : { outcome },
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
