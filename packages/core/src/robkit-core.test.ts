import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandProblem } from "@robkit/input/command";
import { describe, expect, it } from "vitest";
import { robkitCore, watches, watchFlags } from "./robkit-core.ts";

const usage = `Usage: robkit-core <command>

  start    gives each app its database, migrates core's, then serves core
  migrate  migrates core's database
  serve    serves core, for pnpm dev, which has given each app its database`;

/** Settings core's serving process takes, none of them the provision step's. */
const core = {
  DATABASE_URL: "postgres://core:pw@db:5432/robkit",
  ROBKIT_CORE_URL: "https://core.robkit.test",
  PORT: "3000",
};

describe("robkit-core", () => {
  it("says how to use it when it has no command, or too many", async () => {
    await expect(robkitCore([], {})).rejects.toEqual(new CommandProblem(usage));
    await expect(robkitCore(["start", "now"], {})).rejects.toEqual(
      new CommandProblem(usage),
    );
  });

  it("names a command it doesn't have", async () => {
    await expect(robkitCore(["boot"], {})).rejects.toEqual(
      new CommandProblem(`robkit-core has no command "boot".\n\n${usage}`),
    );
  });

  it("stops before it provisions when a setting of core's own won't do", async () => {
    await expect(
      robkitCore(["start"], {
        DATABASE_URL: "postgres://core:pw@db:5432/robkit",
        PORT: "3000",
        // The provision step would refuse this too, but core's go first.
        ROBKIT_DB_SECRET: "short",
      }),
    ).rejects.toEqual(
      new CommandProblem(
        "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.",
      ),
    );
  });

  it("stops with the reader's message when only one provisioning setting is set", async () => {
    await expect(
      robkitCore(["start"], { ...core, ROBKIT_DB_SECRET: "x".repeat(32) }),
    ).rejects.toEqual(
      new CommandProblem(
        "ROBKIT_ADMIN_DATABASE_URL is not set. robkit deploy sets it on core from the host's shared variable of that name.",
      ),
    );
    await expect(
      robkitCore(["start"], {
        ...core,
        ROBKIT_ADMIN_DATABASE_URL: "postgres://postgres:pw@db:5432/robkit",
      }),
    ).rejects.toEqual(
      new CommandProblem(
        "ROBKIT_DB_SECRET is not set. robkit deploy sets it on core from the host's shared variable of that name.",
      ),
    );
  });

  it("stops before it migrates when DATABASE_URL isn't set", async () => {
    await expect(robkitCore(["migrate"], {})).rejects.toEqual(
      new CommandProblem(
        "DATABASE_URL is not set. Run the app with pnpm dev, which sets it, or set it to a postgres:// URL.",
      ),
    );
  });
});

describe("watches", () => {
  it("watches core's source in a checkout an install links to", () => {
    expect(watches(join("/home/me/robkit/packages/core/src", "x.ts"))).toBe(
      true,
    );
  });

  it("runs no watcher in a packed or vendored install", () => {
    expect(
      watches(
        join(
          "/srv/install/node_modules/.pnpm/@robkit+core@0.1.0/node_modules/@robkit/core/dist",
          "x.js",
        ),
      ),
    ).toBe(false);
  });
});

describe("watchFlags", () => {
  it("has Node watch the source of each robkit package in the checkout, and nothing under node_modules", async () => {
    const packages = fileURLToPath(new URL("../..", import.meta.url));
    const watching = (name: string) =>
      `--watch-path=${join(packages, name, "src")}`;

    const flags = await watchFlags(
      fileURLToPath(new URL("robkit-core.ts", import.meta.url)),
    );

    expect(flags).toContain(watching("core"));
    // A package core imports, and one it doesn't.
    expect(flags).toContain(watching("session"));
    expect(flags).toContain(watching("create-robkit"));
    expect(
      flags.filter((flag) => flag.split(sep).includes("node_modules")),
    ).toEqual([]);
    expect(flags.filter((flag) => !flag.startsWith("--watch-path="))).toEqual(
      [],
    );
  });
});
