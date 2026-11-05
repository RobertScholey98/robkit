import { glob, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const metrics = ["statements", "branches", "functions", "lines"] as const;

export type Thresholds = Partial<Record<(typeof metrics)[number], number>>;

/** Where a workspace package's Vitest config sits, from the workspace root. */
export const vitestConfigs = "{packages,tooling}/*/vitest.config.{ts,js}";

/**
 * Reads the coverage thresholds a Vitest config sets, written as a literal
 * `thresholds: { lines: 90, ... }`.
 */
export function thresholdsIn(config: string): Thresholds | undefined {
  const body = /thresholds:\s*\{([^}]*)\}/.exec(config)?.[1];
  if (body === undefined) return undefined;
  const thresholds: Thresholds = {};
  for (const [, metric, value] of body.matchAll(
    new RegExp(String.raw`(${metrics.join("|")}):\s*([\d.]+)`, "g"),
  )) {
    thresholds[metric as keyof Thresholds] = Number(value);
  }
  return thresholds;
}

export interface PackageCoverage {
  name: string;
  /** Whether its test script measures coverage. */
  coverage: boolean;
  thresholds: Thresholds | undefined;
}

/** Reads how each workspace package with a test script measures coverage. */
export async function readWorkspaceCoverage(
  root: string,
): Promise<PackageCoverage[]> {
  const configs = new Map<string, string>();
  for await (const path of glob(vitestConfigs, { cwd: root })) {
    configs.set(dirname(path), await readFile(join(root, path), "utf8"));
  }
  const packages: PackageCoverage[] = [];
  for await (const path of glob("{packages,tooling}/*/package.json", {
    cwd: root,
  })) {
    const json = JSON.parse(await readFile(join(root, path), "utf8")) as {
      name: string;
      scripts?: Record<string, string>;
    };
    const test = json.scripts?.test;
    if (test === undefined) continue;
    const config = configs.get(dirname(path));
    packages.push({
      name: json.name,
      coverage: test.includes("--coverage"),
      thresholds: config === undefined ? undefined : thresholdsIn(config),
    });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}
