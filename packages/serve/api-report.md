# @robkit/serve API

Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.

## @robkit/serve

```ts
export interface Files {
  at: string;
  folder: string;
}
export interface ListenOptions {
  hostname: string;
  port: number;
  name: string;
  onStopped: () => Promise<void>;
}
export function listenUntilStopped(
  app: RequestHandler,
  options: ListenOptions,
): Promise<number>;
export type RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => unknown;
export function serve(app: RequestHandler, options?: ServeOptions): Server;
export interface ServeOptions extends ServerOptions {
  files?: readonly Files[];
  address?: {
    host: string;
    port: number;
  };
}
export interface ServerOptions {
  name?: string;
  onStopped?: () => Promise<void>;
}
```
