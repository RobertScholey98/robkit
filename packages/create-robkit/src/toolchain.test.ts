import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { pathWith } from "./test/path.ts";
import { dockerNote, requirePnpm } from "./toolchain.ts";

const packageManager = "pnpm@11.28.9";

describe("requirePnpm", () => {
  it("says to enable Corepack when pnpm is missing and Corepack is there", async () => {
    const env = await pathWith({ corepack: "0.34.0" });

    const checking = requirePnpm(packageManager, env);

    await expect(checking).rejects.toThrow(CommandProblem);
    await expect(checking).rejects.toThrow(
      "pnpm isn't installed, or isn't on your PATH, and init installs with it. Run corepack enable, then run npm create robkit again.",
    );
  });

  it("says to install pnpm with npm when Corepack is missing too", async () => {
    const env = await pathWith({});

    await expect(requirePnpm(packageManager, env)).rejects.toThrow(
      "pnpm isn't installed, or isn't on your PATH, and init installs with it. Run npm install -g pnpm, then run npm create robkit again.",
    );
  });

  it("stops on a pnpm that won't switch to the install's version", async () => {
    const env = await pathWith({ pnpm: "9.15.9" });

    await expect(requirePnpm(packageManager, env)).rejects.toThrow(
      "pnpm 9.15.9 can't run pnpm 11.28.9, which the install uses. Run npm install -g pnpm, then run npm create robkit again.",
    );
  });

  it("passes a pnpm that runs the install's version", async () => {
    const env = await pathWith({ pnpm: "11.28.9" });

    await expect(requirePnpm(packageManager, env)).resolves.toBeUndefined();
  });

  it("passes the pnpm this checkout runs, asking it from a folder that names the version", async () => {
    await expect(
      requirePnpm(packageManager, process.env),
    ).resolves.toBeUndefined();
  });
});

describe("dockerNote", () => {
  it("warns that pnpm dev needs Docker when it's missing", async () => {
    const env = await pathWith({});

    expect(dockerNote(env)).toBe(
      "Docker isn't installed, or isn't on your PATH. pnpm dev runs Postgres in it, so install it first: https://docs.docker.com/get-started/get-docker/",
    );
  });

  it("says nothing when Docker is there", async () => {
    const env = await pathWith({ docker: "Docker version 29.0.0" });

    expect(dockerNote(env)).toBeUndefined();
  });
});
