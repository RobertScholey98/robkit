# @robkit/vite API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/vite

```ts
export function robkit({ guarded }?: RobkitOptions): Plugin;
export interface RobkitOptions {
  guarded?: boolean;
}
```

## @robkit/vite/express

```ts
export function expressApp(entry: string): Plugin;
```
