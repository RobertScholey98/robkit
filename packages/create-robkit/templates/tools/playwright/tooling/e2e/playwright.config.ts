import { defineConfig, devices } from "@playwright/test";
import { port, postgresPort, project, root } from "./src/stack.ts";

export default defineConfig({
  testDir: "src",
  forbidOnly: Boolean(process.env.CI),
  // The tests share one stack and one database, in order.
  workers: 1,
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    // Starts from an empty database, even after a run that didn't finish.
    command: "docker compose down --volumes && pnpm dev",
    cwd: root,
    port,
    env: {
      ROBKIT_DEV_PORT: String(port),
      ROBKIT_POSTGRES_PORT: String(postgresPort),
      COMPOSE_PROJECT_NAME: project,
    },
    reuseExistingServer: false,
    // As Ctrl-C would, so pnpm dev stops every app and Postgres.
    gracefulShutdown: { signal: "SIGINT", timeout: 30_000 },
    timeout: 180_000,
  },
  globalTeardown: "./src/teardown.ts",
});
