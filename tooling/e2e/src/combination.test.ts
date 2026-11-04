import { describe, expect, inject, it } from "vitest";
import { ownCiSteps, runOwnCi } from "./own-ci.ts";

const { name, tools, dir, path } = inject("combination");

describe(`npm create robkit -- ${name}`, () => {
  it("passes its own CI workflow's steps", async () => {
    const steps = await ownCiSteps(dir);

    const runs = steps.flatMap((step) => step.run ?? []);
    expect(runs).toContainEqual(
      expect.stringMatching(/^(pnpm|(bun|yarn) run) build$/),
    );
    expect(runs.some((step) => step.endsWith(" test:e2e"))).toBe(
      tools.includes("playwright"),
    );
    // A failing step rejects with its output.
    await runOwnCi(dir, steps, { ...process.env, PATH: path });
  });
});
