# create-robkit API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## create-robkit

```ts
export interface AppDeployment {
  slug: Slug;
  env: Record<string, DeploymentValue>;
}
export interface Choices {
  exampleStack: Stack;
}
export const defaultChoices: Choices;
export function deploymentOf(
  root: string,
  { domain, port, trustedProxy }: DeploymentOptions,
): Promise<AppDeployment[]>;
export interface DeploymentOptions {
  domain: Domain;
  port?: number;
  trustedProxy?: TrustedProxy | undefined;
}
export type DeploymentValue =
  | {
      literal: string;
    }
  | {
      shared: string;
    };
export function init(
  choices: Choices,
  dir: string,
  { install, env, ...options }?: InitOptions,
): Promise<InitResult>;
export interface InitOptions extends GenerateOptions {
  install?: boolean;
  env?: NodeJS.ProcessEnv;
}
export interface InitResult {
  notes: string[];
}
export const readyStacks: Stack[];
export const robkitCommands: readonly string[];
export type Stack = Ready["value"];
export function stackFrom(value: string): Stack;
export const stacks: readonly [
  {
    readonly value: "start";
    readonly label: "TanStack Start";
  },
  {
    readonly value: "react-hono";
    readonly label: "React + Hono";
  },
  {
    readonly value: "express";
    readonly label: "React + Express";
  },
  {
    readonly value: "next";
    readonly label: "Next.js";
  },
  {
    readonly value: "go";
    readonly label: "React + Go";
    readonly ownsDatabase: true;
    readonly toolchain: "go";
  },
];
```
