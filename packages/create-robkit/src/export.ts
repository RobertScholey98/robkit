import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { isPlatformApp } from "@robkit/session/addresses";
import { format } from "prettier";
import { Document } from "yaml";
import { readInstallChoices } from "./add.ts";
import { checkInstall, describeProblem, importsIn, isScript } from "./check.ts";
import { contractVersion } from "./contract.ts";
import { pnpmSettings } from "./generate.ts";
import {
  appPackageName,
  dependenciesOf,
  editDependencies,
  manifestBytes,
  packageNamed,
  parseManifest,
  readTree,
  readWorkspace,
  writeTree,
  type Manifest,
  type Tree,
  type Workspace,
} from "./sharing.ts";

const run = promisify(execFile);

/**
 * The first line of each file export writes for the repo rather than the
 * app. Import leaves out a file that starts with it.
 */
export const writtenByExport = "Written by robkit export.";

/** The folder in an app's repo that holds the install code it uses. */
export const sharedFolder = "shared";

/** robkit's packages, which every install provides, so export never copies. */
const isContract = (name: string) => name.startsWith("@robkit/");

/** What the install's ESLint config needs, for an app that lints on its own. */
const lintDependencies = [
  "@eslint/js",
  "eslint",
  "globals",
  "typescript-eslint",
];

export interface ExportOptions {
  /** Where to write the app's repo. Defaults to `../<slug>` beside the install. */
  out?: string;
}

export interface Exported {
  /** The app's repo. */
  dir: string;
  /** The install's packages copied into `shared/`, by name. */
  shared: string[];
  /** Whether this export committed anything: false when nothing changed. */
  committed: boolean;
}

/** An install package the app uses, as it goes into `shared/<folder>`. */
interface SharedPackage {
  name: string;
  folder: string;
  tree: Tree;
}

/** The text of an import, a CSS `@import` or a tsconfig `extends`. */
function specifiersIn(path: string, text: string): string[] {
  if (isScript(path)) return importsIn(path, text);
  if (path.endsWith(".css")) {
    return [
      ...text.matchAll(
        /@(?:import|plugin|reference)\s+(?:url\()?["']([^"']+)["']/g,
      ),
    ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
  }
  return [];
}

/**
 * The install's workspace packages the app at `apps/<slug>` uses, and those
 * they use in turn: each one its manifest takes through `workspace:` and
 * each one its code imports. Also the ones its code imports without listing
 * them.
 */
async function sharedPackages(
  root: string,
  slug: string,
  manifest: Manifest,
  app: Tree,
  workspace: Workspace,
): Promise<{ packages: SharedPackage[]; unlisted: string[] }> {
  const listed = dependenciesOf(manifest).flatMap(([name, spec]) =>
    spec.startsWith("workspace:") ? [name] : [],
  );
  const imported = new Set<string>();
  for (const [path, bytes] of app) {
    for (const specifier of specifiersIn(path, bytes.toString("utf8"))) {
      const name = packageNamed(specifier);
      if (name !== undefined && workspace.packages.has(name)) {
        imported.add(name);
      }
    }
  }
  imported.delete(manifest.name ?? "");
  const unlisted = [...imported].filter((name) => !listed.includes(name));

  const packages = new Map<string, SharedPackage>();
  // A shared package an earlier import kept is the app's own code now.
  const folders = new Map<string, string>(
    [...app.keys()].flatMap((path) => {
      const [top, folder] = path.split("/");
      return top === sharedFolder && folder !== undefined
        ? [[folder, `apps/${slug}/${sharedFolder}/${folder}`] as const]
        : [];
    }),
  );
  const queue = [...listed, ...unlisted];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (packages.has(name) || isContract(name)) continue;
    const found = workspace.packages.get(name);
    if (found === undefined) {
      throw new Error(
        `apps/${slug} takes ${name} from the workspace, but the install has no package by that name.`,
      );
    }
    if (found.folder.startsWith(`apps/${slug}/`)) continue;
    if (found.folder.startsWith("apps/")) {
      throw new Error(
        `apps/${slug} uses ${name} from ${found.folder}. An app never imports another app.`,
      );
    }
    const folder = name.split("/").at(-1) ?? name;
    const taken = folders.get(folder);
    if (taken !== undefined) {
      throw new Error(
        `apps/${slug} uses both ${taken} and ${name}, which would share ${sharedFolder}/${folder}.`,
      );
    }
    folders.set(folder, name);
    const tree = await readTree(join(root, found.folder));
    packages.set(name, { name, folder, tree });
    const own = parseManifest(tree.get("package.json"), found.folder);
    for (const [dep, spec] of dependenciesOf(own)) {
      if (spec.startsWith("workspace:")) queue.push(dep);
    }
  }
  return { packages: [...packages.values()], unlisted };
}

/**
 * `manifest` with every version an install keeps in its catalog written out,
 * so the repo installs on its own. A workspace package stays `workspace:`,
 * since the repo's own workspace holds it in `shared/`.
 */
function withVersions(manifest: Manifest, workspace: Workspace): Manifest {
  return editDependencies(manifest, (name, spec) => {
    if (spec === "catalog:" || spec === "catalog:default") {
      const version = workspace.catalog.get(name);
      if (version === undefined) {
        throw new Error(
          `${manifest.name ?? "A package"} takes ${name} from the catalog, which has no version for it.`,
        );
      }
      return [name, version];
    }
    if (spec.startsWith("catalog:")) {
      throw new Error(
        `${manifest.name ?? "A package"} takes ${name} from the named catalog ${spec}, which export doesn't handle.`,
      );
    }
    if (spec.startsWith("workspace:")) return [name, "workspace:*"];
    return [name, spec];
  });
}

/**
 * The app's own manifest as its repo holds it: concrete versions, the
 * contract version it was made for, pnpm's version, and the scripts and
 * tools that lint and test it on its own if it has none.
 */
function repoManifest(
  manifest: Manifest,
  slug: string,
  unlisted: string[],
  workspace: Workspace,
  rootManifest: Manifest,
): Manifest {
  const scripts = { ...manifest.scripts };
  const devDependencies = { ...manifest.devDependencies };
  const dependencies = { ...manifest.dependencies };
  for (const name of unlisted) dependencies[name] = "workspace:*";
  const has = (name: string) =>
    dependencies[name] !== undefined || devDependencies[name] !== undefined;
  const needs = (names: string[]) => {
    for (const name of names)
      if (!has(name)) devDependencies[name] = "catalog:";
  };
  if (scripts.lint === undefined) {
    scripts.lint = "eslint .";
    needs(lintDependencies);
  }
  if (scripts.test === undefined) {
    scripts.test = "vitest run";
    needs(["vitest"]);
  }
  const { packageManager } = rootManifest;
  return withVersions(
    {
      ...manifest,
      name: appPackageName(slug),
      ...(packageManager !== undefined && { packageManager }),
      scripts,
      ...(Object.keys(dependencies).length > 0 && { dependencies }),
      devDependencies,
      robkit: {
        name: slug,
        ...manifest.robkit,
        contract: manifest.robkit?.contract ?? contractVersion,
      },
    },
    workspace,
  );
}

async function formatted(text: string, filepath: string): Promise<Buffer> {
  return Buffer.from(await format(text, { filepath }));
}

/** The repo's `pnpm-workspace.yaml`: `shared/*`, and robkit's packages. */
async function repoSettings(
  workspace: Workspace,
  overrides: Map<string, string>,
): Promise<Buffer> {
  const settings = new Document({
    packages: [`${sharedFolder}/*`],
    ...(overrides.size > 0 && { overrides: Object.fromEntries(overrides) }),
    allowBuilds: workspace.settings.get("allowBuilds") ?? { esbuild: false },
  });
  settings.commentBefore = ` ${writtenByExport} robkit import leaves it out.
 The app's own copy of the install code it uses is in ${sharedFolder}/.${
   overrides.size > 0
     ? `
 Until robkit's packages are on npm, the overrides take them from where the
 install the app came from took them.`
     : ""
 }`;
  return formatted(settings.toString(), pnpmSettings);
}

function readme(
  manifest: Manifest,
  slug: string,
  shared: SharedPackage[],
  linked: boolean,
  seeds: boolean,
): string {
  const { name = slug, description, stack, contract } = manifest.robkit ?? {};
  return `<!-- ${writtenByExport} robkit import leaves it out. -->

# ${name}

${description ? `${description}\n\n` : ""}A robkit app${stack ? ` on the ${stack} stack` : ""}, made for robkit contract ${String(contract)}. It was exported from a robkit install with \`pnpm robkit export ${slug}\`.

## Import it

From an install's root:

\`\`\`sh
pnpm robkit import <this repo's folder or git URL>
\`\`\`

\`--as <slug>\` gives it another name. The next \`pnpm dev\` gives it its own schema, runs its migrations and, on a new schema, its seed${seeds ? " (`seed.sql`)" : ""}.

## Work on it here

\`\`\`sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
\`\`\`

It runs only inside an install, which gives it its database, its sign-in and its subdomain, so \`pnpm dev\` here doesn't start it. Import it into an install to run it.
${
  shared.length > 0
    ? `
\`${sharedFolder}/\` holds the install code it uses: ${shared.map((pkg) => `\`${pkg.name}\``).join(", ")}. robkit import maps each folder back onto the install's own package where they're the same, and keeps it in the app where they differ.
`
    : ""
}${
    linked
      ? `
Until robkit's packages are on npm, \`pnpm-workspace.yaml\` takes them from where the install it came from took them, so \`pnpm install\` works only on that machine.
`
      : ""
  }`;
}

const gitignore = `# ${writtenByExport} robkit import leaves it out.
node_modules/
.turbo/
dist/
.env
.env.*
!.env.example
`;

const vitestConfig = `import { defineConfig } from "vitest/config";

// pnpm test runs the app's tests without its Vite config, which needs the
// environment pnpm dev gives it.
export default defineConfig({ test: { passWithNoTests: true } });
`;

/** The files of the app's repo, by their path from its root. */
async function repoTree(
  root: string,
  slug: string,
  workspace: Workspace,
): Promise<{ tree: Tree; shared: SharedPackage[] }> {
  const app = await readTree(join(root, "apps", slug));
  const manifest = parseManifest(app.get("package.json"), `apps/${slug}`);
  const { packages: shared, unlisted } = await sharedPackages(
    root,
    slug,
    manifest,
    app,
    workspace,
  );
  const rootManifest = parseManifest(
    await readFile(join(root, "package.json")),
    "The install",
  );
  const own = repoManifest(manifest, slug, unlisted, workspace, rootManifest);

  const tree: Tree = new Map(app);
  for (const [path, bytes] of app) {
    // Packages of the app's own, such as one an earlier import kept.
    if (path.endsWith("/package.json")) {
      tree.set(
        path,
        manifestBytes(withVersions(parseManifest(bytes, path), workspace)),
      );
    }
  }
  tree.set("package.json", manifestBytes(own));
  if (own.scripts?.test === "vitest run" && !tree.has("vitest.config.ts")) {
    tree.set(
      "vitest.config.ts",
      await formatted(vitestConfig, "vitest.config.ts"),
    );
  }
  for (const pkg of shared) {
    for (const [path, bytes] of pkg.tree) {
      tree.set(
        `${sharedFolder}/${pkg.folder}/${path}`,
        path === "package.json"
          ? manifestBytes(
              withVersions(parseManifest(bytes, pkg.name), workspace),
            )
          : bytes,
      );
    }
  }

  // robkit's packages from the checkout or the tarballs the install takes
  // them from, until they're on npm.
  const overrides = new Map<string, string>();
  for (const [name, spec] of workspace.overrides) {
    if (!isContract(name) && name !== "create-robkit") continue;
    if (spec.startsWith("file:")) {
      const tarball = spec.slice("file:".length);
      tree.set(tarball, await readFile(join(root, tarball)));
    }
    overrides.set(name, spec);
  }
  tree.set(pnpmSettings, await repoSettings(workspace, overrides));
  if (!tree.has("eslint.config.js")) {
    const config = await readFile(join(root, "eslint.config.js"), "utf8");
    tree.set(
      "eslint.config.js",
      Buffer.from(
        `// ${writtenByExport} robkit import leaves it out. It is the install's\n// ESLint config, so the app lints on its own.\n${config}`,
      ),
    );
  }
  if (!tree.has(".gitignore")) tree.set(".gitignore", Buffer.from(gitignore));
  if (!tree.has("README.md")) {
    tree.set(
      "README.md",
      await formatted(
        readme(own, slug, shared, overrides.size > 0, app.has("seed.sql")),
        "README.md",
      ),
    );
  }
  return {
    tree: new Map([...tree].sort(([a], [b]) => (a < b ? -1 : 1))),
    shared,
  };
}

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: dir });
  return stdout;
}

/** A name and email for the commit, when git has none set up. */
async function identity(dir: string): Promise<string[]> {
  const set = await git(dir, "config", "user.email").then(
    (email) => email.trim() !== "",
    () => false,
  );
  return set
    ? []
    : ["-c", "user.name=robkit", "-c", "user.email=robkit@localhost"];
}

/** What a repo keeps between exports: its history and its install. */
const keptBetweenExports = new Set([".git", "node_modules", "pnpm-lock.yaml"]);

/**
 * Makes `dir` ready for an export of the app named `name`: a new git
 * repository if it's missing or empty, or the same app's repo emptied of
 * everything but its history and install.
 */
async function prepareRepo(dir: string, name: string): Promise<void> {
  const entries: string[] = await readdir(dir).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  if (entries.length === 0) {
    await mkdir(dir, { recursive: true });
    await git(dir, "init", "--quiet", "--initial-branch=main");
    return;
  }
  if (!entries.includes(".git")) {
    throw new Error(
      `${dir} isn't empty and isn't a git repository. Choose another folder with --out.`,
    );
  }
  const manifest = existsSync(join(dir, "package.json"))
    ? parseManifest(await readFile(join(dir, "package.json")), dir)
    : undefined;
  if (manifest !== undefined && manifest.name !== name) {
    throw new Error(
      `${dir} holds another app, ${manifest.name ?? "with no name"}. Choose another folder with --out.`,
    );
  }
  for (const entry of entries) {
    if (keptBetweenExports.has(entry)) continue;
    await rm(join(dir, entry), { recursive: true, force: true });
  }
}

/**
 * `robkit export`: writes the app at `apps/<slug>` in the install at `root`
 * as a repo of its own, outside the install. The repo holds the app's own
 * files, a copy of the install code it uses in `shared/`, concrete versions
 * for the catalog's, its migrations and seed, and a README. The first export
 * makes the folder a git repository; each export commits what changed.
 */
export async function exportApp(
  root: string,
  slug: string,
  { out }: ExportOptions = {},
): Promise<Exported> {
  // Refuses a folder that isn't an install.
  await readInstallChoices(root);
  if (isPlatformApp(slug)) {
    throw new Error(
      `${slug} is one of the platform apps every install has, so it isn't exported.`,
    );
  }
  if (!existsSync(join(root, "apps", slug, "package.json"))) {
    throw new Error(`apps/${slug} doesn't exist in this install.`);
  }
  const problems = (await checkInstall(root)).filter((problem) =>
    problem.file.startsWith(`apps/${slug}/`),
  );
  if (problems.length > 0) {
    throw new Error(
      `apps/${slug} breaks the layer rule, so it can't leave the install:\n${problems.map(describeProblem).join("\n")}`,
    );
  }

  const workspace = await readWorkspace(root);
  const { tree, shared } = await repoTree(root, slug, workspace);
  const dir = resolve(root, out ?? join("..", slug));
  await prepareRepo(dir, appPackageName(slug));
  await writeTree(dir, tree);
  await git(dir, "add", "--all");
  const changed = (await git(dir, "status", "--porcelain")).trim() !== "";
  if (changed) {
    const first = await git(dir, "rev-parse", "--verify", "HEAD").then(
      () => false,
      () => true,
    );
    await git(
      dir,
      ...(await identity(dir)),
      "commit",
      "--quiet",
      "-m",
      first ? `Export ${slug} from a robkit install` : `Export ${slug} again`,
    );
  }
  return {
    dir,
    shared: shared.map((pkg) => pkg.name),
    committed: changed,
  };
}
