// Runs inside an app's image, on node alone, and prints the installed
// packages the app doesn't run on, one per line: each package under a
// node_modules that the app, or the install's root, doesn't reach through
// dependencies, optional dependencies or peers. A workspace package the app
// only builds with, such as packages/ui for the hub, is a dev dependency, so
// its own dependencies count too. pnpm and bun lay node_modules out
// differently, so it walks the files rather than asking a package manager.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

const root = "/install";
const app = join(root, "apps", process.env.ROBKIT_APP ?? "");

function manifest(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

/** Every package directory under a node_modules, by its real path. */
function installed(dir, found = new Set()) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".cache") continue;
    const path = join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      installed(path, found);
      continue;
    }
    // pnpm's and bun's stores hold each package's own node_modules.
    if (entry.name === ".pnpm" || entry.name === ".bun") {
      for (const stored of readdirSync(path)) {
        installed(join(path, stored, "node_modules"), found);
      }
      continue;
    }
    if (!existsSync(join(path, "package.json"))) continue;
    const real = realpathSync(path);
    if (real.includes("/node_modules/") && !found.has(real)) {
      found.add(real);
      installed(join(real, "node_modules"), found);
    }
  }
  return found;
}

/** Where `name` resolves from `dir`, as Node looks it up. */
function lookUp(dir, name) {
  for (let at = realpathSync(dir); ; at = dirname(at)) {
    const candidate = join(at, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    if (at === dirname(at)) return undefined;
  }
}

function workspaces() {
  const dirs = [root];
  for (const group of ["apps", "packages", "tooling"]) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (existsSync(join(dir, name, "package.json"))) {
        dirs.push(join(dir, name));
      }
    }
  }
  return dirs;
}

/** Every package production reaches from the app's and root's dependencies. */
function reached() {
  const seen = new Set();
  const queue = [root, app].map((dir) => ({
    dir,
    names: Object.keys(manifest(dir).dependencies ?? {}),
  }));
  while (queue.length > 0) {
    const { dir, names } = queue.pop();
    for (const name of names) {
      const found = lookUp(dir, name);
      if (found === undefined || seen.has(found)) continue;
      seen.add(found);
      const json = manifest(found);
      queue.push({
        dir: found,
        names: [
          ...Object.keys(json.dependencies ?? {}),
          ...Object.keys(json.optionalDependencies ?? {}),
          ...Object.keys(json.peerDependencies ?? {}),
        ],
      });
    }
  }
  return seen;
}

const needed = reached();
const extraneous = [...installed(join(root, "node_modules"))]
  .concat(
    ...workspaces().map((dir) => [...installed(join(dir, "node_modules"))]),
  )
  .filter((dir) => !needed.has(dir))
  .map((dir) => {
    const { name, version } = manifest(dir);
    return `${name}@${version}`;
  });
console.log([...new Set(extraneous)].sort().join("\n"));
