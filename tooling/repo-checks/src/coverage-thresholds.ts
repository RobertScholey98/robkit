import { glob, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { packageFolders } from "@internal/eslint-config/package-graph";
import { type InputProblem, isRecord, problem } from "@robkit/input";
import { readJsonFile, readNamedManifest } from "./manifest.ts";

const metrics = ["statements", "branches", "functions", "lines"] as const;

export type Thresholds = Partial<Record<(typeof metrics)[number], number>>;

/** Where a workspace package's Vitest config sits, from the workspace root. */
export const vitestConfigs = `{${packageFolders.join(",")}}/vitest.config.{ts,js}`;

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

/**
 * Lists how a config's thresholds went down from `before` to `after`.
 * Thresholds only go up: raise one when coverage rises, never lower one.
 */
export function loweredThresholds(
  path: string,
  before: Thresholds | undefined,
  after: Thresholds | undefined,
): string[] {
  if (before === undefined) return [];
  if (after === undefined)
    return [`${path} no longer sets coverage thresholds.`];
  return metrics.flatMap((metric) => {
    const was = before[metric];
    const is = after[metric];
    if (was === undefined) return [];
    if (is === undefined) {
      return [
        `${path} drops the ${metric} threshold, which was ${String(was)}.`,
      ];
    }
    return is < was
      ? [
          `${path} lowers the ${metric} threshold from ${String(was)} to ${String(is)}.`,
        ]
      : [];
  });
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
  for await (const path of glob(
    packageFolders.map((folder) => `${folder}/package.json`),
    { cwd: root },
  )) {
    const json = await readJsonFile(join(root, path), readNamedManifest);
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

/** What a package's tests cover, as a percentage per metric. */
export type Coverage = Record<(typeof metrics)[number], number>;

const isCounts = (value: unknown): value is Record<string, number> =>
  isRecord(value) &&
  Object.values(value).every((count) => typeof count === "number");

const isBranchCounts = (value: unknown): value is Record<string, number[]> =>
  isRecord(value) &&
  Object.values(value).every(
    (counts) =>
      Array.isArray(counts) &&
      counts.every((count) => typeof count === "number"),
  );

/** The line each statement starts on, by the statement's key. */
function statementLines(value: unknown): Map<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const lines = new Map<string, number>();
  for (const [key, location] of Object.entries(value)) {
    const start = isRecord(location) ? location.start : undefined;
    const line = isRecord(start) ? start.line : undefined;
    if (typeof line !== "number") return undefined;
    lines.set(key, line);
  }
  return lines;
}

/** Istanbul's percentage, rounded down to two places, which Vitest compares. */
function percent(covered: number, total: number): number {
  return total === 0 ? 100 : Math.floor((10_000 * covered) / total) / 100;
}

/**
 * The totals in a coverage-final.json, which Vitest's v8 coverage writes in
 * Istanbul's format, as Vitest totals them to check thresholds. A line
 * counts as covered when any statement starting on it ran.
 */
export function readCoverage(
  json: unknown,
  source: string,
): Coverage | InputProblem {
  if (!isRecord(json)) return problem(`${source} must be a JSON object.`);
  const counted = { statements: 0, branches: 0, functions: 0, lines: 0 };
  const covered = { ...counted };
  for (const [file, data] of Object.entries(json)) {
    const field = (key: string): unknown =>
      isRecord(data) ? data[key] : undefined;
    const s = field("s");
    const f = field("f");
    const b = field("b");
    const starts = statementLines(field("statementMap"));
    if (!isCounts(s) || !isCounts(f) || !isBranchCounts(b) || !starts) {
      return problem(`${source} has no Istanbul coverage for ${file}.`);
    }
    const lines = new Map<number, number>();
    for (const [key, count] of Object.entries(s)) {
      const line = starts.get(key) ?? 0;
      lines.set(line, Math.max(lines.get(line) ?? 0, count));
    }
    const tally = (metric: keyof Coverage, counts: number[]) => {
      counted[metric] += counts.length;
      covered[metric] += counts.filter((count) => count > 0).length;
    };
    tally("statements", Object.values(s));
    tally("functions", Object.values(f));
    tally("branches", Object.values(b).flat());
    tally("lines", [...lines.values()]);
  }
  return {
    statements: percent(covered.statements, counted.statements),
    branches: percent(covered.branches, counted.branches),
    functions: percent(covered.functions, counted.functions),
    lines: percent(covered.lines, counted.lines),
  };
}

/**
 * How far a threshold may sit below what a package measures. CI's coverage
 * is the reference, so this many points leaves room for a small change in a
 * later pull request without letting a threshold fall behind.
 */
export const ratchetSlack = 2;

/**
 * Lists the thresholds in `path` that sit more than `ratchetSlack` points
 * under `measured`, each with the number to raise it to: the measurement,
 * rounded down.
 */
export function thresholdsBelowCoverage(
  path: string,
  thresholds: Thresholds,
  measured: Coverage,
): string[] {
  return metrics.flatMap((metric) => {
    const threshold = thresholds[metric];
    const is = measured[metric];
    if (threshold === undefined || is - threshold <= ratchetSlack) return [];
    return [
      `${path} sets the ${metric} threshold to ${String(threshold)}, but its tests cover ${String(is)}%. Raise it to ${String(Math.floor(is))}.`,
    ];
  });
}
