import { describe, expect, it } from "vitest";
import {
  parseJson,
  readAppSlug,
  readCoreUrl,
  readDatabaseUrl,
  readDomain,
  readHost,
  readPort,
  readSet,
} from "./input.ts";

describe("readPort", () => {
  it("reads a port", () => {
    expect(readPort({ PORT: "3001" })).toBe(3001);
    expect(readPort({ ROBKIT_DEV_PORT: "8080" }, "ROBKIT_DEV_PORT")).toBe(8080);
  });

  it("takes the fallback when it's unset or empty", () => {
    expect(readPort({}, "PORT", 3000)).toBe(3000);
    expect(readPort({ PORT: "" }, "PORT", 3000)).toBe(3000);
  });

  it("says to set it when there's no fallback", () => {
    expect(readPort({})).toEqual({
      error:
        "PORT is not set. Set it to the port to listen on, a whole number from 1 to 65535.",
    });
  });

  it.each(["0", "65536", "70000", "-1", "3000.5", "abc", " 3000", "3e3"])(
    "refuses %j",
    (value) => {
      expect(readPort({ PORT: value }, "PORT", 3000)).toEqual({
        error: `PORT is "${value}", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.`,
      });
    },
  );
});

describe("readHost", () => {
  it("listens on loopback unless HOST says otherwise", () => {
    expect(readHost({})).toBe("127.0.0.1");
    expect(readHost({ HOST: "0.0.0.0" })).toBe("0.0.0.0");
    expect(readHost({ HOST: "::" })).toBe("::");
  });

  it.each(["http://0.0.0.0", "0.0.0.0:3000/", "a host"])(
    "refuses %j",
    (value) => {
      expect(readHost({ HOST: value })).toEqual({
        error: `HOST is "${value}", which isn't an address to listen on. Set it to an IP address or host name, such as 0.0.0.0, or leave it unset for 127.0.0.1.`,
      });
    },
  );
});

describe("readDomain", () => {
  it("reads the install's domain", () => {
    expect(readDomain({ ROBKIT_DOMAIN: "robkit.dev" })).toBe("robkit.dev");
    expect(readDomain({}, "robkit.localhost")).toBe("robkit.localhost");
  });

  it("says to set it when there's no fallback", () => {
    expect(readDomain({})).toEqual({
      error:
        "ROBKIT_DOMAIN is not set. Set it to the install's domain, such as robkit.dev.",
    });
  });

  it.each([
    "https://robkit.dev",
    "robkit.dev:443",
    "robkit.dev/",
    "-x.dev",
    "a..b",
  ])("refuses %j", (value) => {
    expect(readDomain({ ROBKIT_DOMAIN: value })).toEqual({
      error: `ROBKIT_DOMAIN is "${value}", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path.`,
    });
  });
});

describe("readCoreUrl", () => {
  it("reads core's public origin", () => {
    expect(
      readCoreUrl({ ROBKIT_CORE_URL: "http://core.robkit.localhost:3000" }),
    ).toBe("http://core.robkit.localhost:3000");
  });

  it("says pnpm dev sets it", () => {
    expect(readCoreUrl({})).toEqual({
      error:
        "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.",
    });
  });

  it.each([
    "core.robkit.dev",
    "https://hub.robkit.dev",
    "ftp://core.robkit.dev",
  ])("refuses %j", (value) => {
    expect(readCoreUrl({ ROBKIT_CORE_URL: value })).toEqual({
      error: `ROBKIT_CORE_URL is "${value}", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev.`,
    });
  });
});

describe("readAppSlug", () => {
  it("reads the app's slug", () => {
    expect(readAppSlug({ ROBKIT_APP: "notes" })).toBe("notes");
  });

  it("says pnpm dev sets it", () => {
    expect(readAppSlug({})).toEqual({
      error:
        "ROBKIT_APP is not set. Run the app with pnpm dev, which sets it to the app's slug.",
    });
  });

  it("says what a slug is", () => {
    expect(readAppSlug({ ROBKIT_APP: "My-App" })).toEqual({
      error: `ROBKIT_APP: "My-App" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });
});

describe("readDatabaseUrl", () => {
  it("reads a Postgres URL", () => {
    const url = "postgres://notes:secret@127.0.0.1:5432/robkit";
    expect(readDatabaseUrl({ DATABASE_URL: url })).toBe(url);
    expect(
      readDatabaseUrl(
        { ROBKIT_ADMIN_DATABASE_URL: url },
        "ROBKIT_ADMIN_DATABASE_URL",
      ),
    ).toBe(url);
  });

  it("says to set it", () => {
    expect(readDatabaseUrl({})).toEqual({
      error:
        "DATABASE_URL is not set. Run the app with pnpm dev, which sets it, or set it to a postgres:// URL.",
    });
  });

  it("refuses another kind of URL without showing it, since it may hold a password", () => {
    expect(readDatabaseUrl({ DATABASE_URL: "mysql://u:secret@db/x" })).toEqual({
      error:
        "DATABASE_URL isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database.",
    });
  });
});

describe("readSet", () => {
  it("reads a variable that must be set", () => {
    expect(
      readSet({ COOLIFY_TOKEN: "t" }, "COOLIFY_TOKEN", "Set it to deploy."),
    ).toBe("t");
  });

  it("says what to do when it isn't", () => {
    expect(
      readSet({ COOLIFY_TOKEN: "" }, "COOLIFY_TOKEN", "Set it to deploy."),
    ).toEqual({
      error: "COOLIFY_TOKEN is not set. Set it to deploy.",
    });
  });
});

describe("parseJson", () => {
  it("parses JSON", () => {
    expect(parseJson('{"a":1}', "robkit.json")).toEqual({ json: { a: 1 } });
    expect(parseJson("null", "robkit.json")).toEqual({ json: null });
  });

  it("names the file that isn't JSON", () => {
    expect(parseJson("{", "robkit.json")).toEqual({
      error: expect.stringMatching(
        /^robkit\.json isn't valid JSON \(.+\)\. Fix its syntax\.$/,
      ) as unknown,
    });
  });
});
