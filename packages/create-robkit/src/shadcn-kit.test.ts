import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const script = fileURLToPath(
  new URL("../scripts/shadcn-kit.ts", import.meta.url),
);

// Running the kit for real needs the network, so only its refusals run here.
describe("scripts/shadcn-kit.ts", () => {
  it("says how to run it when given an argument, without a stack", async () => {
    const running = run(process.execPath, [script, "extra"]);

    await expect(running).rejects.toMatchObject({
      code: 1,
      stderr:
        "shadcn-kit takes no arguments. Run it as: pnpm --filter create-robkit shadcn-kit\n",
    });
  });
});
