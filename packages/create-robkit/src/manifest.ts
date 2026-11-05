/** Who may open an app when core first adds it. A rule's roles are named. */
export type Access =
  { kind: "open" } | { kind: "owner" } | { kind: "roles"; roles: string[] };

/**
 * An app's manifest: the `robkit` field of its `package.json`. Core's
 * catalog reads `access` and `icon` when it first sees the app. The rest
 * says what the app is when it travels to another install.
 */
export interface Manifest {
  /** What the app is called, whatever slug an install gives it. */
  name?: string;
  description?: string;
  /** The stack it was made on, for people. No robkit command reads it. */
  stack?: string;
  /** The contract version it was made for. */
  contract?: number;
  /** Who may open it when an install's core first adds it. */
  access?: Access;
  /** The emoji the launcher shows. */
  icon?: string;
}

/** An app's `package.json`, as robkit reads it. */
export interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  robkit?: Manifest;
}

/** The package name of the app at `apps/<slug>`, which the Dockerfile builds. */
export function packageNameOf(slug: string): string {
  return `@internal/${slug}-app`;
}

/**
 * The contract's version. The contract is what every install of one robkit
 * version gives an app: the `@robkit/*` packages, the install's fixed
 * workspace packages (`packages/ui`, `packages/theme`, `packages/core-client`
 * and `tooling/typescript`) and the catalog. An app that uses nothing else
 * runs in any install that runs its contract version. A change that would
 * break an app made for the old contract bumps it: a changed export of one
 * of those packages, a major version in the catalog, or a manifest field an
 * install reads differently.
 */
export const contractVersion = 1;

/**
 * The contract versions an install on this robkit can run. An install
 * declares them through the robkit it runs, its `create-robkit` dev
 * dependency, rather than in a file of its own, which could drift from the
 * packages it really has.
 */
export const runsContracts: readonly number[] = [contractVersion];

/**
 * Why an install on this robkit can't run an app whose manifest says it was
 * made for `contract`, or `undefined` if it can.
 */
export function contractProblem(contract: unknown): string | undefined {
  if (contract === undefined) {
    return "Its package.json has no robkit.contract, so there's no telling which robkit it was made for.";
  }
  if (typeof contract !== "number" || !Number.isInteger(contract)) {
    return `Its robkit.contract is ${JSON.stringify(contract)}, which isn't a contract version.`;
  }
  if (runsContracts.includes(contract)) return undefined;
  const runs = runsContracts.join(", ");
  return contract > Math.max(...runsContracts)
    ? `It was made for robkit contract ${String(contract)}, and this install's robkit runs contract ${runs}. Update robkit in this install, or ask its author for a version made for contract ${runs}.`
    : `It was made for robkit contract ${String(contract)}, which this install's robkit no longer runs (it runs ${runs}). Ask its author for a version made for contract ${runs}.`;
}
