import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { isRecord } from "@robkit/input";
import { isStrings, readJsonFile, readManifest } from "./manifest.ts";

const checkedFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

type CheckedField = (typeof checkedFields)[number];

export type PackageJson = Partial<
  Record<CheckedField | "peerDependencies", Record<string, string>>
>;

export interface Manifest {
  /** Path from the workspace root, with forward slashes. */
  path: string;
  json: PackageJson;
}

export interface Violation {
  path: string;
  field: CheckedField;
  name: string;
  spec: string;
}

/**
 * Lists every dependency whose version doesn't come from the pnpm catalog.
 * Peer dependencies are exempt: they are ranges for consumers, not pins.
 */
export function findUncataloguedDependencies(
  manifests: Manifest[],
): Violation[] {
  return manifests.flatMap(({ path, json }) =>
    checkedFields.flatMap((field) =>
      Object.entries(json[field] ?? {})
        .filter(
          ([, spec]) =>
            !spec.startsWith("catalog:") && !spec.startsWith("workspace:"),
        )
        .map(([name, spec]) => ({ path, field, name, spec })),
    ),
  );
}

export async function readWorkspaceManifests(
  root: string,
): Promise<Manifest[]> {
  const manifests: Manifest[] = [];
  const paths = glob("**/package.json", {
    cwd: root,
    exclude: ["**/node_modules/**", ".scratch/**", ".skills/**"],
  });
  for await (const path of paths) {
    const json = await readJsonFile(join(root, path), readManifest);
    manifests.push({ path: path.replaceAll("\\", "/"), json });
  }
  return manifests.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Lists every catalog entry that no manifest takes with `catalog:`. A peer
 * range doesn't count: it isn't a version anything installs.
 */
export function findUnusedCatalogEntries(
  catalog: Record<string, string>,
  manifests: Manifest[],
): string[] {
  const used = new Set(
    manifests.flatMap(({ json }) =>
      checkedFields.flatMap((field) =>
        Object.entries(json[field] ?? {})
          .filter(([, spec]) => spec.startsWith("catalog:"))
          .map(([name]) => name),
      ),
    ),
  );
  return Object.keys(catalog)
    .filter((name) => !used.has(name))
    .sort();
}

/** The default catalog in the workspace's `pnpm-workspace.yaml`. */
export async function readCatalog(
  root: string,
): Promise<Readonly<Record<string, string>>> {
  const workspace: unknown = parse(
    await readFile(join(root, "pnpm-workspace.yaml"), "utf8"),
  );
  const catalog = isRecord(workspace) ? workspace.catalog : undefined;
  if (catalog === undefined) return {};
  if (!isStrings(catalog)) {
    throw new Error(
      "pnpm-workspace.yaml's catalog must map each package to a version.",
    );
  }
  return catalog;
}
