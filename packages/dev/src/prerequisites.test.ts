import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPrerequisites } from "./prerequisites.ts";
import { CommandProblem } from "./run-command.ts";
import { runDev } from "./runner.ts";
import {
  envWithPath,
  fakeCommands,
  type FakeAnswers,
} from "./test/fake-commands.ts";

const pnpm11: FakeAnswers = { "--version": { output: "11.28.9", code: 0 } };
const dockerUp: FakeAnswers = {
  "--version": { output: "Docker version 28.3.2", code: 0 },
  info: { output: "28.3.2", code: 0 },
  compose: { output: "Docker Compose version v2.38.2", code: 0 },
};
const dockerDown: FakeAnswers = {
  ...dockerUp,
  info: { output: "Cannot connect to the Docker daemon.", code: 1 },
};

async function check(
  commands: Record<string, FakeAnswers>,
  nodeVersion = "24.11.0",
): Promise<void> {
  const { dir } = await fakeCommands(commands);
  const root = await mkdtemp(join(tmpdir(), "robkit-"));
  await checkPrerequisites(root, envWithPath(dir), nodeVersion);
}

describe("checkPrerequisites", { concurrent: true }, () => {
  it("passes when Node, pnpm and Docker are ready", async () => {
    await expect(
      check({ pnpm: pnpm11, docker: dockerUp }),
    ).resolves.toBeUndefined();
  });

  it("says to install Node 24 on an older Node", async () => {
    const checking = check({ pnpm: pnpm11, docker: dockerUp }, "22.12.0");

    await expect(checking).rejects.toThrow(CommandProblem);
    await expect(checking).rejects.toThrow(
      "robkit needs Node 24 or later, and this is Node 22.12.0. Install Node 24, such as with nvm install 24, then run pnpm dev again.",
    );
  });

  it("says to enable Corepack when pnpm doesn't run", async () => {
    await expect(check({ docker: dockerUp })).rejects.toThrow(
      "pnpm --version didn't run. Install pnpm 11 with corepack enable, then run pnpm dev again.",
    );
  });

  it("says to enable Corepack on an older pnpm", async () => {
    const pnpm9 = { "--version": { output: "9.15.0", code: 0 } };

    await expect(check({ pnpm: pnpm9, docker: dockerUp })).rejects.toThrow(
      "robkit needs pnpm 11 or later, and pnpm --version says 9.15.0. Run corepack enable, so pnpm is the version the install's package.json pins, then run pnpm dev again.",
    );
  });

  it("says to install Docker when it isn't there", async () => {
    await expect(check({ pnpm: pnpm11 })).rejects.toThrow(
      "docker --version didn't run. Install Docker (Docker Desktop, or Docker Engine with its Compose plugin), then run pnpm dev again.",
    );
  });

  it("says to start Docker when it doesn't answer, with what it said", async () => {
    await expect(check({ pnpm: pnpm11, docker: dockerDown })).rejects.toThrow(
      "docker info couldn't reach Docker: Cannot connect to the Docker daemon. Start Docker Desktop, or the Docker service, then run pnpm dev again.",
    );
  });

  it("says to install Compose when Docker has no compose command", async () => {
    const noCompose = {
      ...dockerUp,
      compose: { output: "unknown command: docker compose", code: 1 },
    };

    await expect(check({ pnpm: pnpm11, docker: noCompose })).rejects.toThrow(
      "docker compose version didn't run. Install Docker's Compose plugin, then run pnpm dev again.",
    );
  });

  it("names every missing prerequisite at once", async () => {
    await expect(check({}, "22.12.0")).rejects.toThrow(
      /^robkit-dev can't start yet:\n- robkit needs Node 24.*\n- pnpm --version didn't run.*\n- docker --version didn't run.*$/,
    );
  });
});

describe("runDev", () => {
  it("checks its prerequisites before it starts anything", async () => {
    const { dir, calls } = await fakeCommands({
      pnpm: pnpm11,
      docker: dockerDown,
    });
    const root = await mkdtemp(join(tmpdir(), "robkit-"));

    await expect(runDev(root, envWithPath(dir))).rejects.toThrow(
      "docker info couldn't reach Docker",
    );
    expect((await calls()).sort()).toEqual([
      "docker --version",
      "docker compose version",
      "docker info",
      "pnpm --version",
    ]);
  });
});
