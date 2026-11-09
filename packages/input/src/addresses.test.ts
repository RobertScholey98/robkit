import { describe, expect, it } from "vitest";
import {
  coreInstall,
  defaultDevPort,
  defaultDomain,
  install,
  installAt,
  isLocal,
} from "./addresses.ts";
import { readCoreUrl, readDomain } from "./env.ts";
import { orThrow } from "./problem.ts";
import { readSlug, type Slug } from "./slug.ts";

const robkitDev = orThrow(readDomain({ ROBKIT_DOMAIN: "robkit.dev" }));

/** `name` read as a slug, for a test that names one. */
function slug(name: string): Slug {
  return orThrow(readSlug(name));
}

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
    const hosted = install({ domain: robkitDev, protocol: "https" });

    expect(hosted.origin("core")).toBe("https://core.robkit.dev");
    expect(hosted.origin("hub")).toBe("https://hub.robkit.dev");
    expect(
      install({ domain: robkitDev, protocol: "https", port: 443 }).origin(
        "hub",
      ),
    ).toBe("https://hub.robkit.dev");
    expect(
      install({ domain: robkitDev, protocol: "https", port: 8443 }).origin(
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
});

describe("the install core is on", () => {
  it("works out the install from core's origin", () => {
    const local = coreInstall(
      orThrow(
        readCoreUrl({ ROBKIT_CORE_URL: "http://core.robkit.localhost:3000" }),
      ),
    );
    expect(local.domain).toBe("robkit.localhost");
    expect(local.origin("hub")).toBe("http://hub.robkit.localhost:3000");

    const hosted = coreInstall(
      orThrow(readCoreUrl({ ROBKIT_CORE_URL: "https://core.robkit.dev" })),
    );
    expect(hosted.domain).toBe("robkit.dev");
    expect(hosted.origin("hub")).toBe("https://hub.robkit.dev");
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
    ["http://core.robkit_dev:3000", "core"],
    ["ftp://core.robkit.dev", "core"],
    ["not a url", "core"],
  ])("finds none for %s as %s", (url, app) => {
    expect(installAt(url, app)).toBeUndefined();
  });
});

describe("whether a URL is on the install", () => {
  const hosted = install({ domain: robkitDev, protocol: "https" });

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
  const hosted = install({ domain: robkitDev, protocol: "https" });

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

describe("the app whose own origin a URL is on", () => {
  const installs = {
    hosted: install({ domain: robkitDev, protocol: "https" }),
    local: install({ domain: defaultDomain, port: defaultDevPort }),
  };

  it.each([
    ["https://notes.robkit.dev/list?x=1", "hosted", "notes"],
    ["https://admin.robkit.dev:443/", "hosted", "admin"],
    ["http://notes.robkit.localhost:3000/", "local", "notes"],
    ["http://Admin.Robkit.Localhost:3000/", "local", "admin"],
  ] as const)("finds %s on the %s install", (url, on, slug) => {
    expect(installs[on].appAt(url)).toBe(slug);
    expect(installs[on].appAt(new URL(url))).toBe(slug);
  });

  it.each([
    ["http://notes.robkit.dev/", "hosted"],
    ["https://notes.robkit.dev:8443/", "hosted"],
    ["http://notes.robkit.localhost/", "local"],
    ["https://notes.robkit.localhost:3000/", "local"],
    ["https://a.notes.robkit.dev/", "hosted"],
    ["https://robkit.dev/", "hosted"],
    ["https://notes.robkit.dev.evil.com/", "hosted"],
    ["javascript://notes.robkit.dev/%0aalert(1)", "hosted"],
    ["/relative", "hosted"],
  ] as const)("finds no app for %s on the %s install", (url, on) => {
    expect(installs[on].appAt(url)).toBeUndefined();
  });
});
