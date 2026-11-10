# @robkit/serve API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/serve

```ts
export interface ListenOptions {
  fetch: (request: Request) => Response | Promise<Response>;
  hostname: string;
  port: number;
  name: string;
  onStopped: () => Promise<void>;
}
export function listenUntilStopped({
  fetch: handle,
  hostname,
  port,
  name,
  onStopped,
}: ListenOptions): Promise<number>;
```
