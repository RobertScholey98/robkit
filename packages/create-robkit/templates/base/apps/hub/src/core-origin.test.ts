import { readSlug, orThrow } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { appOrigin, coreOrigin, returnTo } from "./core-origin.ts";

describe("coreOrigin", () => {
  it.each([
    ["http://hub.localhost:3000/", "http://core.localhost:3000"],
    ["https://hub.example.com/apps?x=1", "https://core.example.com"],
    ["https://hub.hub.example.com/", "https://core.hub.example.com"],
  ])("finds core beside the hub at %s", (page, core) => {
    expect(coreOrigin(page)).toBe(core);
  });

  it("refuses a page that is not on the hub's subdomain", () => {
    expect(() => coreOrigin("http://localhost:5173/")).toThrow(/hub\./);
  });
});

describe("returnTo", () => {
  it.each([
    [
      "http://hub.robkit.localhost:3000/?next=http%3A%2F%2Fexample.robkit.localhost%3A3000%2Fnotes%3Fx%3D1",
      "http://example.robkit.localhost:3000/notes?x=1",
    ],
    [
      "https://hub.example.com/?next=https%3A%2F%2Fadmin.example.com%2F",
      "https://admin.example.com/",
    ],
  ])("returns from %s to the app it names", (page, next) => {
    expect(returnTo(page)).toBe(next);
  });

  it.each([
    ["no next", "https://hub.example.com/"],
    ["another site", "https://hub.example.com/?next=https%3A%2F%2Fevil.com%2F"],
    [
      "a look-alike domain",
      "https://hub.example.com/?next=https%3A%2F%2Fexample.com.evil.com%2F",
    ],
    [
      "a script",
      "https://hub.example.com/?next=javascript%3Aalert(1)%2F%2F.example.com",
    ],
    ["a relative path", "https://hub.example.com/?next=%2Fsomewhere"],
  ])("stays on the hub for %s", (_, page) => {
    expect(returnTo(page)).toBeUndefined();
    expect(
      returnTo(
        `${page.split("?")[0] ?? ""}?next=https%3A%2F%2Fa.example.com%2F`,
      ),
    ).toBe("https://a.example.com/");
  });
});

describe("appOrigin", () => {
  it.each([
    [
      "http://hub.robkit.localhost:3000/",
      "http://example.robkit.localhost:3000",
    ],
    ["https://hub.example.com/?x=1", "https://example.example.com"],
  ])("puts the app beside the hub at %s", (page, origin) => {
    const example = orThrow(readSlug("example"));
    expect(appOrigin(page, example)).toBe(origin);
  });
});
