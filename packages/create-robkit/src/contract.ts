import { basename } from "node:path";
import { baseTemplate, catalogued, stackTemplate } from "./generate.ts";
import { readyStacks } from "./choices.ts";

/** What an app may use from outside its own folder and dependencies. */
export interface Contract {
  /** The install's fixed workspace packages, by name. */
  packages: ReadonlySet<string>;
  /** Every name in the catalog that every install of this robkit has. */
  catalog: ReadonlySet<string>;
}

/** Whether `name` is a package of the contract: `@robkit/*` or a fixed one. */
export function inContract(name: string, contract: Contract): boolean {
  return name.startsWith("@robkit/") || contract.packages.has(name);
}

/** The contract of this robkit, read from its templates. */
export async function readContract(): Promise<Contract> {
  const base = await baseTemplate();
  const packages = new Set<string>();
  for (const [path, text] of base) {
    if (
      basename(path) === "package.json" &&
      /^(packages|tooling)\/[^/]+\/package\.json$/.test(path)
    ) {
      const { name } = JSON.parse(text) as { name?: string };
      if (name !== undefined) packages.add(name);
    }
  }
  const stacks = await Promise.all(readyStacks.map(stackTemplate));
  const catalog = new Set(
    catalogued([...base, ...stacks.flatMap((stack) => [...stack])]),
  );
  return { packages, catalog };
}
