import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

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
    const json = JSON.parse(
      await readFile(join(root, path), "utf8"),
    ) as PackageJson;
    manifests.push({ path: path.replaceAll("\\", "/"), json });
  }
  return manifests.sort((a, b) => a.path.localeCompare(b.path));
}
