// Vite is a build tool, so no production image may hold it. An image
// installs each package an app runs on with its dependencies, and pnpm
// installs a missing peer too, optional or not. So a published package
// that names vite, other than @robkit/vite, would put Vite in the image of
// every app that runs on it. The production test's extra-packages check
// counts a peer as needed, so it wouldn't say so. An app lists
// @robkit/vite under devDependencies, which an image leaves out.

import { join, relative } from "node:path";
import { readJsonFile, readManifest, type Manifest } from "./manifest.ts";
import { publishedPackages } from "./published.ts";

const fields = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** A package's manifest, and its path from the repo's root. */
interface Published {
  path: string;
  json: Manifest;
}

/** Each published package's manifest. */
export async function readPublishedManifests(): Promise<Published[]> {
  const root = join(import.meta.dirname, "../../..");
  const manifests: Published[] = [];
  for (const dir of await publishedPackages()) {
    const path = join(dir, "package.json");
    manifests.push({
      path: relative(root, path).replaceAll("\\", "/"),
      json: await readJsonFile(path, readManifest),
    });
  }
  return manifests;
}

/** A line for each field of a package other than @robkit/vite that names vite. */
export function viteNamedProblems(manifests: readonly Published[]): string[] {
  return manifests
    .filter(({ json }) => json.name !== "@robkit/vite")
    .flatMap(({ path, json }) =>
      fields
        .filter((field) => json[field]?.vite !== undefined)
        .map(
          (field) =>
            `${path} names vite under ${field}. Only @robkit/vite may, since an app lists it under devDependencies; a package an app runs on would put Vite in its production image. Move what needs Vite into @robkit/vite.`,
        ),
    );
}
