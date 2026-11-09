import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { ownCiSteps } from "./own-ci.ts";

async function installWithWorkflow(workflow: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-test-own-ci-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, ".github/workflows"), { recursive: true });
  await writeFile(join(dir, ".github/workflows/ci.yml"), workflow);
  return dir;
}

describe("ownCiSteps", () => {
  it("leaves out a job that runs only on some events, as deploy does", async () => {
    const dir = await installWithWorkflow(`
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: check
    runs-on: ubuntu-latest
    steps:
      - run: pnpm robkit deploy
`);

    expect(await ownCiSteps(dir)).toEqual([
      { run: "pnpm install --frozen-lockfile" },
      { run: "pnpm build" },
    ]);
  });
});
