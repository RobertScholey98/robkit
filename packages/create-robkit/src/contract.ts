/**
 * The robkit contract version: what an app may assume of the install it
 * runs in. Version 1 is the `@robkit/*` packages' API at the catalog's
 * versions, the install's own `packages/ui`, `packages/theme`,
 * `packages/core-client` and `tooling/typescript` by name, the catalog's
 * dependency versions, and the provision step's rules: a `migrate` script, an
 * optional `seed.sql` at the app's root, `DATABASE_URL`, `ROBKIT_APP`,
 * `PORT`, and the guard owning every path under `/_robkit/`. robkit raises
 * it when an app made for one version would break on the next.
 */
export const contractVersion = 1;

/**
 * The contract versions an install on this robkit runs. An install takes
 * create-robkit, which holds this list, at its catalog's version, so this is
 * where an install declares what it can import.
 */
export const runsContracts: readonly number[] = [contractVersion];
