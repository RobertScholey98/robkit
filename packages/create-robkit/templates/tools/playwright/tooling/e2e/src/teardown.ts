import { execFileSync } from "node:child_process";
import { project, root } from "./stack.ts";

/** Removes the stack's Postgres and its data once the tests are done. */
export default function teardown(): void {
  execFileSync("docker", ["compose", "-p", project, "down", "--volumes"], {
    cwd: root,
    stdio: "inherit",
  });
}
