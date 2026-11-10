import { describe, expect, it } from "vitest";
import { sessionCookieOn } from "@internal/test-session";
import { sessionCookies, sessionTokensIn } from "./index.ts";

const hostOnly = { path: "/", httpOnly: true, sameSite: "Lax" } as const;

describe("sessionCookies", () => {
  it("prefixes the names with __Host- and marks them Secure on an https install", () => {
    expect(sessionCookies("https://core.robkit.dev")).toEqual({
      session: "__Host-robkit_session",
      state: "__Host-robkit_state",
      attributes: { ...hostOnly, secure: true },
    });
  });

  it("keeps the plain names, without Secure, on an http install", () => {
    expect(sessionCookies("http://core.robkit.localhost:3000")).toEqual({
      session: "robkit_session",
      state: "robkit_state",
      attributes: { ...hostOnly, secure: false },
    });
  });

  it("follows the protocol, not the domain", () => {
    expect([
      sessionCookies("https://notes.robkit.localhost:3443").session,
      sessionCookies("http://notes.example.com").session,
    ]).toEqual(["__Host-robkit_session", "robkit_session"]);
  });
});

describe("the test fakes' copy of the session cookie's name", () => {
  // @internal/test-session can't import this package, whose tests use it,
  // so it writes the names out. This fails if the two ever disagree.
  it.each([
    "https://core.robkit.dev",
    "https://core.robkit.localhost:3443",
    "http://core.robkit.localhost:3000",
  ])("agrees with sessionCookies on %s", (origin) => {
    expect(sessionCookieOn(origin)).toBe(sessionCookies(origin).session);
  });
});

describe("sessionTokensIn", () => {
  it("lists every session cookie a request to an https install sends, in order, under the __Host- name alone", () => {
    expect(
      sessionTokensIn(
        "robkit_session=x.y.z; __Host-robkit_session=a.b.c; theme=dark;__Host-robkit_session = d.e.f",
        "https://core.robkit.dev",
      ),
    ).toEqual(["a.b.c", "d.e.f"]);
  });

  it("reads the plain name alone on an http install", () => {
    expect(
      sessionTokensIn(
        "__Host-robkit_session=x.y.z; robkit_session=a.b.c",
        "http://core.robkit.localhost:3000",
      ),
    ).toEqual(["a.b.c"]);
  });

  it("lists none without a cookie header", () => {
    const origin = "https://core.robkit.dev";

    expect([
      sessionTokensIn(null, origin),
      sessionTokensIn("theme=dark", origin),
    ]).toEqual([[], []]);
  });
});
