import { describe, expect, it } from "vitest";
import {
  defaultDevPort,
  defaultDomain,
  install,
  installAt,
  isLocal,
  isPlatformApp,
  platformApps,
  readSlug,
  slugProblem,
} from "./addresses.ts";
import { slug } from "./test/slug.ts";

describe("an install's addresses", () => {
  it("puts each app on its own subdomain of a local install", () => {
    const local = install({ domain: defaultDomain, port: defaultDevPort });

    expect(local.domain).toBe("robkit.localhost");
    expect(local.host(slug("notes"))).toBe("notes.robkit.localhost");
    expect(local.origin("core")).toBe("http://core.robkit.localhost:3000");
    expect(local.origin("hub")).toBe("http://hub.robkit.localhost:3000");
    expect(local.origin(slug("notes"))).toBe(
      "http://notes.robkit.localhost:3000",
    );
  });

  it("serves a hosted install over https on the default port", () => {
    const hosted = install({ domain: "robkit.dev", protocol: "https" });

    expect(hosted.origin("core")).toBe("https://core.robkit.dev");
    expect(hosted.origin("hub")).toBe("https://hub.robkit.dev");
    expect(
      install({ domain: "robkit.dev", protocol: "https", port: 443 }).origin(
        "hub",
      ),
    ).toBe("https://hub.robkit.dev");
    expect(
      install({ domain: "robkit.dev", protocol: "https", port: 8443 }).origin(
        "hub",
      ),
    ).toBe("https://hub.robkit.dev:8443");
  });

  it("counts localhost and the names under it as local, and nothing else", () => {
    expect(
      ["localhost", "robkit.localhost", "robkit.dev", "notlocalhost"].map(
        isLocal,
      ),
    ).toEqual([true, true, false, false]);
  });

  it("names the platform apps", () => {
    expect(platformApps).toEqual(["core", "hub", "admin"]);
    expect(
      ["core", "hub", "admin", "notes", "hubs"].map(isPlatformApp),
    ).toEqual([true, true, true, false, false]);
  });
});

describe("the install an address is on", () => {
  it.each([
    [
      "http://core.robkit.localhost:3000",
      "core",
      "http://hub.robkit.localhost:3000",
    ],
    ["http://core.localhost:3000/refresh", "core", "http://hub.localhost:3000"],
    ["https://core.robkit.dev", "core", "https://hub.robkit.dev"],
    ["https://hub.robkit.dev/i/K7XQ2?x=1", "hub", "https://hub.robkit.dev"],
    [
      "https://hub.apps.example.com:8443/",
      "hub",
      "https://hub.apps.example.com:8443",
    ],
  ])("finds %s's hub from %s", (url, app, hub) => {
    expect(installAt(url, app)?.origin("hub")).toBe(hub);
  });

  it("reads the domain after the app's own label", () => {
    expect(installAt("https://hub.apps.example.com", "hub")?.domain).toBe(
      "apps.example.com",
    );
    expect(
      installAt(new URL("http://core.robkit.localhost:3000"), "core")?.origin(
        slug("notes"),
      ),
    ).toBe("http://notes.robkit.localhost:3000");
  });

  it.each([
    ["http://localhost:3000", "core"],
    ["http://hub.robkit.localhost:3000", "core"],
    ["http://core.:3000", "core"],
    ["ftp://core.robkit.dev", "core"],
    ["not a url", "core"],
  ])("finds none for %s as %s", (url, app) => {
    expect(installAt(url, app)).toBeUndefined();
  });
});

describe("whether a URL is on the install", () => {
  const hosted = install({ domain: "robkit.dev", protocol: "https" });

  it.each([
    "https://notes.robkit.dev/list?x=1",
    "http://notes.robkit.dev/",
    "https://hub.robkit.dev/",
  ])("takes %s", (url) => {
    expect(hosted.onInstall(url)).toBe(url);
  });

  it.each([
    undefined,
    "",
    "/relative",
    "https://robkit.dev/",
    "https://evil.com/?robkit.dev",
    "https://notes.robkit.dev.evil.com/",
    "https://evilrobkit.dev/",
    "javascript://notes.robkit.dev/%0aalert(1)",
  ])("refuses %s", (url) => {
    expect(hosted.onInstall(url)).toBeUndefined();
  });
});

describe("the app a URL is on", () => {
  const hosted = install({ domain: "robkit.dev", protocol: "https" });

  it.each([
    ["https://notes.robkit.dev/list?x=1", "notes"],
    ["http://admin.robkit.dev:8443/", "admin"],
    ["https://core.robkit.dev/refresh", "core"],
    ["https://notes2.robkit.dev/", "notes2"],
  ])("finds %s on %s", (url, slug) => {
    expect(hosted.appOf(url)).toBe(slug);
  });

  it.each([
    "https://robkit.dev/",
    "https://a.notes.robkit.dev/",
    "https://my-app.robkit.dev/",
    "https://public.robkit.dev/",
    "https://notes.robkit.dev.evil.com/",
    "javascript://notes.robkit.dev/%0aalert(1)",
    "/relative",
  ])("finds no app for %s", (url) => {
    expect(hosted.appOf(url)).toBeUndefined();
  });
});

describe("readSlug", () => {
  it.each(["notes", "start", "blog2", "a1", "x".repeat(63), "admin"])(
    "reads %j",
    (name) => {
      expect(readSlug(name)).toBe(name);
    },
  );

  it.each([
    "My-App",
    "my-app",
    "my_app",
    "1notes",
    "_notes",
    "drop table x;--",
    "public",
    "postgres",
    "pg_admin",
    "x".repeat(64),
    "",
  ])("refuses %j", (name) => {
    expect(readSlug(name)).toEqual({
      error: `"${name}" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });

  it.each([
    [null, "null"],
    [42, "42"],
    [undefined, "Nothing"],
    [["notes"], '["notes"]'],
  ])("refuses %j, which isn't text", (value, shown) => {
    expect(readSlug(value)).toEqual({
      error: `${shown} can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });
});

describe("slugProblem", () => {
  it("says why a name can't be a slug, for a prompt's validate", () => {
    expect(slugProblem("notes")).toBeUndefined();
    expect(slugProblem("My-App")).toMatch(/^"My-App" can't be an app's slug/);
  });
});

describe("the platform apps", () => {
  it.each(platformApps)("%s is a slug", (name) => {
    expect(readSlug(name)).toBe(name);
  });
});
