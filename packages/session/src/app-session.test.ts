import { describe, expect, it } from "vitest";
import { appSessionUrl } from "./app-session.ts";

describe("appSessionUrl", () => {
  const next = "https://notes.robkit.dev/lists?id=1";

  it("sends the browser to the app's callback with its token and state", () => {
    expect(appSessionUrl(next, { token: "t.k.n", state: "s1" })).toBe(
      "https://notes.robkit.dev/_robkit/session?next=https%3A%2F%2Fnotes.robkit.dev%2Flists%3Fid%3D1&state=s1&token=t.k.n",
    );
  });

  it("carries no token when nobody is signed in", () => {
    expect(appSessionUrl(next, { state: "s1" })).toBe(
      "https://notes.robkit.dev/_robkit/session?next=https%3A%2F%2Fnotes.robkit.dev%2Flists%3Fid%3D1&state=s1",
    );
  });

  it("carries no state when the app sent none", () => {
    expect(appSessionUrl(next, {})).toBe(
      "https://notes.robkit.dev/_robkit/session?next=https%3A%2F%2Fnotes.robkit.dev%2Flists%3Fid%3D1",
    );
  });
});
