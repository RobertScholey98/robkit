import { describe, expect, it } from "vitest";
import { sessionCookies } from "./index.ts";

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
