import { fileURLToPath } from "node:url";
import type { ViteUserConfig } from "vitest/config";

/**
 * What every package's tests run with. Each `vitest.config` spreads it into
 * its `test`, and `test-defaults.test.ts` in repo-checks fails one that
 * doesn't.
 */
export const testDefaults = {
  env: {
    // No git name or email of the machine's own, as on CI's runner.
    GIT_CONFIG_GLOBAL: fileURLToPath(
      new URL("no-git-identity.gitconfig", import.meta.url),
    ),
  },
  expect: {
    // Vitest's default is one second, which a process starting or a lock
    // being taken can pass on a busy machine. A poll ends as soon as its
    // value is right, so a longer limit costs a passing test nothing.
    poll: { timeout: 30_000 },
  },
} satisfies NonNullable<ViteUserConfig["test"]>;
