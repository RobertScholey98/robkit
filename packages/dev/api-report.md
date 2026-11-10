# @robkit/dev API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/dev

```ts
export interface App {
  slug: Slug;
  dir: string;
  port: number;
  migrates: boolean;
  manifest: AppManifest;
}
export interface AppManifestFile {
  name?: string;
  scripts: Record<string, string>;
  manifest: AppManifest;
}
export function appManifestFileIn(
  root: string,
  folder: string,
): Promise<AppManifestFile | undefined>;
export function catalogOf(apps: readonly App[]): string;
export function discoverApps(root: string, firstPort?: number): Promise<App[]>;
```

## @robkit/dev/cli

```ts
export function askDev(
  root: string,
  request: DevRequest,
  env?: NodeJS.ProcessEnv,
): Promise<DevAnswer>;
export { CommandProblem } from "@robkit/input/command";
export type DevAnswer =
  | {
      outcome: "done";
      message: string;
    }
  | {
      outcome: "refused";
      message: string;
    }
  | {
      outcome: "not-running";
    };
export type DevOperation = "add" | "migrate";
export interface DevRequest {
  operation: DevOperation;
  slug: Slug;
}
export function devSocket(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<DevSocket>;
export interface DevSocket {
  folder: string;
  path: string;
  setBy: "XDG_RUNTIME_DIR" | "TMPDIR";
}
export function exec(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    slug?: string;
    quiet?: boolean;
  },
): Promise<void>;
export function isMissing(error: unknown): boolean;
export { reportFaultsAt } from "@robkit/input/command";
export function requireGo(env?: NodeJS.ProcessEnv): Promise<void>;
export { runCommand } from "@robkit/input/command";
```
