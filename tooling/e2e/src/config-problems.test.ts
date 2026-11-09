import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, inject, it } from "vitest";

const run = promisify(execFile);

/** Runs `script` with Node in `app`'s folder, without the variable `unset`. */
function runWithout(app: string, script: string, unset: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== unset),
  );
  return run(process.execPath, [script], {
    cwd: join(inject("installs").start, "apps", app),
    env,
  });
}

// A variable that won't do is the owner's to fix, so the app prints the
// line that says how, alone, rather than a stack.
describe("an app of the default install that starts with a config problem", () => {
  it("prints admin's server's problem alone and exits 1", async () => {
    await expect(
      runWithout("admin", "src/serve.ts", "ROBKIT_CORE_URL"),
    ).rejects.toMatchObject({
      code: 1,
      stderr:
        "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.\n",
    });
  });

  it("prints core's problem alone and exits 1, naming ROBKIT_CORE_URL", async () => {
    await expect(
      run(process.execPath, ["src/main.ts"], {
        cwd: join(inject("installs").start, "apps", "core"),
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([name]) => !name.startsWith("ROBKIT_"),
            ),
          ),
          DATABASE_URL: "postgres://core:x@127.0.0.1:1/robkit",
          PORT: "3000",
          ROBKIT_DOMAIN: "robkit.localhost",
        },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr:
        "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.\n",
    });
  });

  it("prints the example's migration's problem alone and exits 1", async () => {
    await expect(
      runWithout("example", "src/migrate.ts", "DATABASE_URL"),
    ).rejects.toMatchObject({
      code: 1,
      stderr:
        "DATABASE_URL is not set. Run the app with pnpm dev, which sets it, or set it to a postgres:// URL.\n",
    });
  });
});
