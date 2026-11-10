import { isProblem } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { readDevConfig } from "./env.ts";

describe("readDevConfig", () => {
  it("runs on robkit.localhost:3000 with Compose's Postgres by default", () => {
    expect(readDevConfig({})).toEqual({
      domain: "robkit.localhost",
      devPort: 3000,
      adminUrl: "postgres://postgres:postgres@127.0.0.1:54320/robkit",
    });
  });

  it("reads each setting", () => {
    expect(
      readDevConfig({
        ROBKIT_DOMAIN: "dev.robkit.localhost",
        ROBKIT_DEV_PORT: "4000",
        ROBKIT_POSTGRES_PORT: "5433",
      }),
    ).toEqual({
      domain: "dev.robkit.localhost",
      devPort: 4000,
      adminUrl: "postgres://postgres:postgres@127.0.0.1:5433/robkit",
    });
    expect(
      readDevConfig({ ROBKIT_DATABASE_URL: "postgres://a:b@db:5432/x" }),
    ).toMatchObject({ adminUrl: "postgres://a:b@db:5432/x" });
  });

  it.each(["localhost", "Robkit.Localhost"])(
    "takes %s, which is local",
    (domain) => {
      expect(readDevConfig({ ROBKIT_DOMAIN: domain })).toMatchObject({
        domain: domain.toLowerCase(),
      });
    },
  );

  it.each(["example.com", "notlocalhost", "localhost.example.com"])(
    "refuses %s, since pnpm dev serves only http",
    (domain) => {
      expect(readDevConfig({ ROBKIT_DOMAIN: domain })).toEqual({
        error: `ROBKIT_DOMAIN is "${domain}", which isn't local. pnpm dev serves plain http, so it runs only on localhost or a name under it, such as robkit.localhost. Leave ROBKIT_DOMAIN unset, or deploy with robkit deploy to serve ${domain}.`,
      });
    },
  );

  it("names every variable that won't do", () => {
    const read = readDevConfig({
      ROBKIT_DOMAIN: "http://robkit.localhost",
      ROBKIT_DEV_PORT: "0",
      ROBKIT_POSTGRES_PORT: "x",
      ROBKIT_DATABASE_URL: "mysql://db",
    });
    expect(isProblem(read) && read.error.split("\n")).toEqual([
      "ROBKIT_DOMAIN is \"http://robkit.localhost\", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path.",
      'ROBKIT_DEV_PORT is "0", which isn\'t a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.',
      "ROBKIT_DATABASE_URL isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database.",
      'ROBKIT_POSTGRES_PORT is "x", which isn\'t a port. Set it to a whole number from 1 to 65535, or leave it unset for 54320.',
    ]);
  });
});
