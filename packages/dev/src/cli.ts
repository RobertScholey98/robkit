// What robkit's command lines share: the one top-level handler, the problem
// it prints without a stack, and running a command and reading files the
// way a command reports them. create-robkit's bins and robkit-dev use it.
// See docs/conventions/errors.md.

export { exec } from "./exec.ts";
export { isMissing } from "./files.ts";
export { CommandProblem, reportFaultsAt, runCommand } from "./run-command.ts";
