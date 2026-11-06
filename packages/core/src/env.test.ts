import { isProblem } from "@robkit/session/input";
import { describe, expect, it } from "vitest";
import { readCoreConfig } from "./env.ts";

const env = {
  DATABASE_URL: "postgres://core:secret@127.0.0.1:5432/robkit",
  ROBKIT_DOMAIN: "robkit.dev",
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
      domain: "robkit.dev",
      apps: [{ slug: "notes" }],
      trustedProxy: "cloudflare",
      host: "0.0.0.0",
      port: 3000,
    });
  });

  it("listens on loopback, with no apps and no proxy beyond the first, by default", () => {
    expect(readCoreConfig(env)).toEqual({
      databaseUrl: env.DATABASE_URL,
      domain: "robkit.dev",
      apps: [],
      host: "127.0.0.1",
      port: 3000,
    });
  });

  it("names every variable that won't do", () => {
    const read = readCoreConfig({
      PORT: "99999",
      ROBKIT_APPS: "{}",
      ROBKIT_TRUSTED_PROXY: "traefik",
    });
    expect(isProblem(read) && read.error.split("\n")).toEqual([
      expect.stringMatching(/^DATABASE_URL is not set\./),
      expect.stringMatching(/^ROBKIT_DOMAIN is not set\./),
      expect.stringMatching(/^ROBKIT_APPS must be a JSON list/),
      expect.stringMatching(/^ROBKIT_TRUSTED_PROXY is "traefik"\./),
      expect.stringMatching(/^PORT is "99999", which isn't a port\./),
    ]);
  });
});
