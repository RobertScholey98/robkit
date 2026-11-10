import { spawn } from "node:child_process";
import { once } from "node:events";
import { CommandProblem } from "@robkit/input/command";

/**
 * Checks that Go's toolchain is on the PATH in `env`, before running or
 * making an app whose server is Go, so a missing `go` gets a message that
 * says how to install it rather than a failure deep inside a script.
 *
 * @throws a {@link CommandProblem} saying how to install Go when `go`
 *   won't start
 */
export async function requireGo(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const go = spawn("go", ["version"], { env, stdio: "ignore" });
  try {
    await once(go, "spawn");
  } catch (error) {
    throw new CommandProblem(
      "Go isn't installed, or isn't on your PATH, and this install's React + Go apps build and run with it. Install Go 1.26 or later from https://go.dev/dl/, open a new terminal, then try again.",
      { cause: error },
    );
  }
  await once(go, "exit");
}
