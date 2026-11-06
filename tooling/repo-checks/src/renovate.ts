/** What the repo pins that Renovate's config must keep to. */
export interface RepoPins {
  /** How old, in minutes, a version must be before pnpm installs it. */
  releaseAgeMinutes: number;
  /** The catalog's TypeScript version, which stays on its minor. */
  typescript: string;
}

/** pnpm 11's `minimumReleaseAge` when `pnpm-workspace.yaml` sets none. */
const pnpmDefaultReleaseAge = 1440;

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const field = (value: unknown, key: string): unknown =>
  isObject(value) ? Reflect.get(value, key) : undefined;

/** The pins in `pnpm-workspace.yaml`, parsed. */
export function readRepoPins(workspace: unknown): RepoPins | string {
  const age = field(workspace, "minimumReleaseAge") ?? pnpmDefaultReleaseAge;
  const typescript = field(field(workspace, "catalog"), "typescript");
  if (typeof age !== "number") {
    return "pnpm-workspace.yaml's minimumReleaseAge must be a number of minutes.";
  }
  if (typeof typescript !== "string") {
    return "pnpm-workspace.yaml's catalog must pin typescript.";
  }
  return { releaseAgeMinutes: age, typescript };
}

const minutesPer: Record<string, number> = {
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
};

/** Renovate's `"3 days"`, in minutes. */
function minutesOf(age: string): number | undefined {
  const match = /^(\d+) (minute|hour|day|week)s?$/.exec(age.trim());
  const per = minutesPer[match?.[2] ?? ""];
  return match?.[1] === undefined || per === undefined
    ? undefined
    : Number(match[1]) * per;
}

/** Whether a package rule caps TypeScript below the catalog's next minor. */
function capsTypescript(rule: unknown, cap: string): boolean {
  const names = field(rule, "matchPackageNames");
  return (
    Array.isArray(names) &&
    names.includes("typescript") &&
    field(rule, "allowedVersions") === `<${cap}`
  );
}

/**
 * Where `renovate.json` would propose a version the repo refuses: one
 * younger than pnpm installs, or a TypeScript past the minor
 * typescript-eslint supports.
 */
export function renovateProblems(config: unknown, pins: RepoPins): string[] {
  if (!isObject(config)) return ["renovate.json must be a JSON object."];
  const problems: string[] = [];
  const advice = `so Renovate would propose versions pnpm install refuses. Set it to "1 day" or longer.`;
  const age = field(config, "minimumReleaseAge");
  if (typeof age !== "string") {
    problems.push(`renovate.json has no minimumReleaseAge, ${advice}`);
  } else if ((minutesOf(age) ?? 0) < pins.releaseAgeMinutes) {
    problems.push(
      `renovate.json's minimumReleaseAge is "${age}", shorter than pnpm's ${String(pins.releaseAgeMinutes)} minutes, ${advice}`,
    );
  }
  const [major = "0", minor = "0"] = pins.typescript.split(".");
  const cap = `${major}.${String(Number(minor) + 1)}.0`;
  const rules = field(config, "packageRules");
  if (
    !Array.isArray(rules) ||
    !rules.some((rule) => capsTypescript(rule, cap))
  ) {
    problems.push(
      `renovate.json lets typescript past ${major}.${minor}, which typescript-eslint doesn't support yet. Add a package rule for typescript with allowedVersions "<${cap}".`,
    );
  }
  return problems;
}
