import { isProblem, type CoreOrigin } from "@robkit/input";
import { describe, expect, expectTypeOf, it } from "vitest";
import { readCoreConfig, type CoreConfig } from "./env.ts";

const env = {
  DATABASE_URL: "postgres://core:secret@127.0.0.1:5432/robkit",
  ROBKIT_CORE_URL: "https://core.robkit.dev",
  PORT: "3000",
};

describe("readCoreConfig", () => {
  it("reads what core starts with", () => {
    expect(
      readCoreConfig({
        ...env,
        HOST: "0.0.0.0",
        ROBKIT_APPS: '[{"slug":"notes"}]',
        ROBKIT_TRUSTED_PROXY: "cloudflare",
      }),
    ).toEqual({
      databaseUrl: env.DATABASE_URL,
      origin: "https://core.robkit.dev",
      apps: [{ slug: "notes" }],
      trustedProxy: "cloudflare",
      host: "0.0.0.0",
      port: 3000,
    });
  });

  it("listens on loopback, with no apps and no proxy beyond the first, by default", () => {
    expect(readCoreConfig(env)).toEqual({
      databaseUrl: env.DATABASE_URL,
      origin: "https://core.robkit.dev",
      apps: [],
      host: "127.0.0.1",
      port: 3000,
    });
  });

  it("reads a mixed-case origin as its lower-case form", () => {
    expect(
      readCoreConfig({ ...env, ROBKIT_CORE_URL: "https://Core.Robkit.DEV" }),
    ).toMatchObject({ origin: "https://core.robkit.dev" });
  });

  it("refuses an http origin off localhost, so tokens never travel in clear", () => {
    expect(
      readCoreConfig({ ...env, ROBKIT_CORE_URL: "http://core.example.com" }),
    ).toEqual({
      error:
        'ROBKIT_CORE_URL is "http://core.example.com", which is http on a domain that isn\'t local. Serve the install over https and set it to https://core.example.com.',
    });
  });

  it.each(["robkit.test", "not a domain"])(
    "reads its domain from ROBKIT_CORE_URL alone, whatever ROBKIT_DOMAIN=%j says",
    (domain) => {
      expect(readCoreConfig({ ...env, ROBKIT_DOMAIN: domain })).toMatchObject({
        origin: "https://core.robkit.dev",
      });
    },
  );

  it("names every variable that won't do", () => {
    const read = readCoreConfig({
      PORT: "99999",
      ROBKIT_APPS: "{}",
      ROBKIT_TRUSTED_PROXY: "traefik",
    });
    expect(isProblem(read) && read.error.split("\n")).toEqual([
      expect.stringMatching(/^DATABASE_URL is not set\./),
      expect.stringMatching(/^ROBKIT_CORE_URL is not set\./),
      expect.stringMatching(/^ROBKIT_APPS must be a JSON list/),
      expect.stringMatching(/^ROBKIT_TRUSTED_PROXY is "traefik"\./),
      expect.stringMatching(/^PORT is "99999", which isn't a port\./),
    ]);
  });

  it("holds core's origin as readCoreUrl checked it", () => {
    expectTypeOf<CoreConfig["origin"]>().toEqualTypeOf<CoreOrigin>();
  });
});
