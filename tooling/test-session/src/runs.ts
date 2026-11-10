import { vi } from "vitest";

/** What `NODE_ENV` and `VITEST` say about the process. */
export interface RunSettings {
  NODE_ENV: string;
  VITEST: string | undefined;
}

/** A production server's: `NODE_ENV` of production, and no `VITEST`. */
export const productionRun: RunSettings = {
  NODE_ENV: "production",
  VITEST: undefined,
};

/**
 * Each way a process can say it is a test run. An adapter's tests prove its
 * main `guarded()` checks a request in each as it does in production, so no
 * setting a test sets opens an app.
 */
export const testRuns: { name: string; settings: RunSettings }[] = [
  {
    name: "NODE_ENV is test",
    settings: { NODE_ENV: "test", VITEST: undefined },
  },
  {
    name: "VITEST is set",
    settings: { NODE_ENV: "production", VITEST: "true" },
  },
  {
    name: "NODE_ENV is development",
    settings: { NODE_ENV: "development", VITEST: undefined },
  },
  { name: "both say test", settings: { NODE_ENV: "test", VITEST: "true" } },
];

/** Sets `NODE_ENV` and `VITEST` as `settings` say, until `vi.unstubAllEnvs()`. */
export function stubRun(settings: RunSettings): void {
  vi.stubEnv("NODE_ENV", settings.NODE_ENV);
  vi.stubEnv("VITEST", settings.VITEST);
}
