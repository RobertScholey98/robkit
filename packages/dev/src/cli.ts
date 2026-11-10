// What robkit's command lines share: the one top-level handler, the problem
// it prints without a stack, running a command and reading files the way a
// command reports them, and asking a running pnpm dev to do something.
// create-robkit's bins and robkit-dev use it. See docs/conventions/errors.md.

export { exec } from "./exec.ts";
export { isMissing } from "./files.ts";
export {
  CommandProblem,
  reportFaultsAt,
  runCommand,
} from "@robkit/input/command";
export {
  askDev,
  devSocket,
  type DevAnswer,
  type DevOperation,
  type DevRequest,
  type DevSocket,
} from "./requests.ts";
export { requireGo } from "./toolchain.ts";
