import { basename, resolve } from "node:path";
import { defaultDomain, install } from "@robkit/session/addresses";

/**
 * The browser tests run the install's own `pnpm dev` on ports and a Compose
 * project of their own, so they start on a fresh database and never touch
 * the one you develop on.
 */
export const root = resolve(import.meta.dirname, "../../..");

/** Compose names a project in lowercase letters, digits, - and _. */
export const project = `${basename(root)
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, "")}-e2e`;

export const port = Number(process.env.ROBKIT_E2E_PORT ?? "3100");

export const postgresPort = Number(
  process.env.ROBKIT_E2E_POSTGRES_PORT ?? "54330",
);

/** Where each app answers on that stack. */
export const addresses = install({ domain: defaultDomain, port });
