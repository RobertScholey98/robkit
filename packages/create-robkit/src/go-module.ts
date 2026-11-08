// How a Go app's go.mod reaches robkit's Go module, which isn't on a module
// proxy: a replace directive, to the checkout's go folder in an install
// made with --link, and to vendor/robkit/go in any other.
import { posix } from "node:path";

/** The module path of robkit's guard for Go, in the checkout's `go/`. */
const goModule = "github.com/RobertScholey98/robkit/go";

/** Where a Go app finds the module `robkit vendor` copies, from its folder. */
export const vendoredGoModule = "../../vendor/robkit/go";

const replaceLine = /^replace github\.com\/RobertScholey98\/robkit\/go => .*$/m;

/**
 * Where the Go apps of an install with `overrides`, its pnpm overrides,
 * find robkit's Go module: the go folder of the checkout a `link:` override
 * points into, or else `vendor/robkit/go`.
 */
export function goModuleFor(overrides: Record<string, string>): string {
  const linked = Object.values(overrides).find((spec) =>
    spec.startsWith("link:"),
  );
  if (linked === undefined) return vendoredGoModule;
  // A linked package is <checkout>/packages/<name>.
  const dir = linked.slice("link:".length).replaceAll("\\", "/");
  return posix.join(dir, "..", "..", "go");
}

/**
 * `goMod`, a go.mod's text, with its replace for robkit's module pointed at
 * `target`. A go.mod without one comes back unchanged.
 */
export function withGoModule(goMod: string, target: string): string {
  // go.mod quotes a path with a space in it.
  const path = /[\s"]/.test(target) ? JSON.stringify(target) : target;
  return goMod.replace(replaceLine, `replace ${goModule} => ${path}`);
}
