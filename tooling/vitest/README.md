# @internal/vitest-config

What every package's tests run with. Each `vitest.config` puts `...testDefaults` first in its `test`, and `test-defaults.test.ts` in `tooling/repo-checks` fails a config that doesn't. `pnpm new:package` writes it into a new package's config.

```ts nocheck
import { testDefaults } from "@internal/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { ...testDefaults } });
```

- **No git identity of the machine's own.** `GIT_CONFIG_GLOBAL` points at `no-git-identity.gitconfig`, which turns on `user.useConfigOnly`. CI's runner has no name or email, so a test that commits sets `user.name` and `user.email` in each repo it makes, every clone included. Without this, a test that forgot passed on any laptop and failed only in CI.
- **`expect.poll` waits up to 30 seconds.** Vitest's default is one second, which a process starting, a lock being taken or a log line appearing can pass on a busy machine. A poll returns as soon as its value is right, so the longer limit costs a passing test nothing. A poll that states its own `timeout` keeps it.

Any package may take it as a dev dependency without an edge in `tooling/eslint/package-graph.js`, as with the shared ESLint and TypeScript configs.
