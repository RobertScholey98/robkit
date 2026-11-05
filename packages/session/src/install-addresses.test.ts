import { describe, expect, it } from "vitest";
import {
  defaultDevPort,
  defaultDomain,
  install,
  installAt,
  isLocal,
  isPlatformApp,
  platformApps,
} from "./install-addresses.ts";

describe("an install's addresses", () => {
  it("puts each app on its own subdomain of a local install", () => {
    const local = install({ domain: defaultDomain, port: defaultDevPort });

    expect(local.domain).toBe("robkit.localhost");
    expect(local.host("notes")).toBe("notes.robkit.localhost");
    expect(local.origin("core")).toBe("http://core.robkit.localhost:3000");
    expect(local.origin("hub")).toBe("http://hub.robkit.localhost:3000");
    expect(local.origin("notes")).toBe("http://notes.robkit.localhost:3000");
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
        "notes",
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
  ])("finds %s on %s", (url, slug) => {
    expect(hosted.appOf(url)).toBe(slug);
  });

  it.each([
    "https://robkit.dev/",
    "https://a.notes.robkit.dev/",
    "https://notes.robkit.dev.evil.com/",
    "javascript://notes.robkit.dev/%0aalert(1)",
    "/relative",
  ])("finds no app for %s", (url) => {
    expect(hosted.appOf(url)).toBeUndefined();
  });
});
