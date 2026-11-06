# 14: Input readers in a package of their own, and branded addresses

**What to build:** Reading input is its own package, so `@robkit/session` holds sessions only. Addresses that have been checked get a type that says so.

Today `@robkit/session` has six entry points and about 60 exports. Next to tokens, the request guard and addresses, it holds the generic input readers, the app manifest format and the env readers for apps. So core, dev and create-robkit depend on session just to read env. The guard's readers return `undefined` on bad input where session's return `InputProblem`. A core URL is a plain `string` until `requestGuard` checks it at runtime.

Raises rubric categories 1 (module boundaries), 2 (public API), 3 (type safety) and 6 (consistency). Evidence: `../research/council-r2-opus.md` sections 1, 2, 3 and 6; `../research/council-r2-sonnet.md` sections 1, 2 and 3; `../research/council-r2-sol.md` sections 1, 2, 3 and 6.

- **A new framework-free package** (`@robkit/input`, or a better name you record in Comments). It holds `InputProblem`, `isProblem`, `isRecord`, `parseJson`, `allProblems`, the single-value readers and an `orThrow(value)` that returns the value or throws its problem. Add it to `tooling/eslint/package-graph.js`, the API reports and the published-package checks.
- **Where the rest goes.** The manifest format and the app env readers move wherever leaves no dependency cycle and the fewest entry points. Move every importer, templates included, and remove session's old entries; robkit is pre-1.0. Session ends with tokens, `requestGuard`, addresses and lapsed sessions, under entry names that match their files.
- **One reader convention.** The guard's `readAccessRule`, `readCodeId`, `readRoleId` and `readRoleIds` return `InputProblem` like every other reader. If the guard can't depend on the new package, say why in Comments and in `docs/conventions/input.md`, which should then name the two kinds of reader and when to use each.
- **Branded addresses.** `CoreOrigin` and `Domain` are brands that only `readCoreUrl` and `readDomain` make. `GuardedOptions.core` and core's env take them, the runtime check in `installOf` in `request-guard.ts` goes, and type tests show a raw string fails.
- **Stricter readers.** `readDomain` and `readHost` check label and total lengths and refuse malformed punctuation. Test oversized labels, bad punctuation, IPv4 and the IPv6 forms robkit supports.
- **Use `orThrow`.** The templates' sites that read and throw by hand (about 13 of them) use `orThrow`.
- **Docs.** You own `docs/conventions/input.md`. Add a changeset for each package you change.

**Blocked by:** 13

**Status:** done

- [x] The input readers live in their own package, and session holds sessions only
- [x] Every reader returns `InputProblem`, or the convention doc says which kind returns what
- [x] `CoreOrigin` and `Domain` are brands, with type tests, and `installOf`'s runtime check is gone
- [x] `readDomain` and `readHost` refuse bad lengths and punctuation
- [x] The templates use `orThrow`
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

- **The package is `@robkit/input`.** It has one entry point, `.`, and imports nothing, so the browser can load it. Lint keeps it free of frameworks and I/O, with the same two rows the guard has.
- **The manifest format and the app env readers moved into `@robkit/input`, and so did `Slug`.** The install's own layer rule (`robkit check`) refuses an app's import of `@robkit/session`'s bare entry, so `readGuardEnv` couldn't go there. The manifest needs `Slug` and is read by core, dev and create-robkit, so it had to sit below all three. With `Slug`, `readSlug`, `slugProblem`, `platformApps` and `isPlatformApp` in `@robkit/input`, session depends on input and there is no cycle. The manifest reads its own access rule (role names), so input doesn't need the guard.
- **Session's entries are `.`, `./addresses` and `./lapsed`,** from `index.ts`, `addresses.ts` and `lapsed.ts`. `./addresses` keeps `install`, `installAt`, `coreInstall`, `isLocal`, `defaultDomain` and `defaultDevPort`. Six entries across session became three, plus input's one.
- **`Report` and `reportToConsole` stay in `@robkit/session`.** The ticket didn't list them, and moving them is outside reading input.
- **The guard depends on `@robkit/input`,** so its four readers return `InputProblem`. The guard's tsconfig now takes Node's types, because the guard type-checks input's source, which uses `URL`. Lint, not types, still keeps the guard's own code free of I/O.
- **`CoreOrigin` and `Domain`.** `readCoreUrl` keeps the origin alone (`https://core.robkit.dev/` reads as `https://core.robkit.dev`) and checks the part after `core.` as a domain. `readDomain` checks its fallback as well, so the brand is never unchecked. `install()` still takes a plain string domain: the ticket asked only for the guard's options and core's config. `coreInstall(core)` in `@robkit/session/addresses` replaces `installOf`'s runtime check.
- **`readHost`** takes an IPv4 address in dotted decimal (no leading zeros), an IPv6 address without brackets or a zone (the forms Node's `listen` takes, checked by the URL parser), or a host name. **`readDomain`** refuses a name whose last label is all digits, which covers IPv4.
- **`orThrow(read)`** throws `new Error(problem.error)`. The 13 template sites use it. The `process.exit(1)` sites in the templates' `serve.ts`, `migrate.ts` and core's `main.ts` stay as they are: they print the problem alone, without a stack.
- **admin's `core-client` readers return `undefined`.** That template package has its own `Reader<T>`, so admin's `access-api.ts` wraps `readAccessRule` in `accessIn`. Moving core-client to `InputProblem` is a separate change.
- I added a test for `appSessionUrl`. Moving the readers out took session's coverage under its thresholds, and that function had no test of its own.

### Proof

- `pnpm check` passes on Windows (format, knip, lint, typecheck, every unit test).
- Each behaviour change went red first: guard's readers (`guard.test.ts`, `guard.test-d.ts`), `orThrow` (`problem.test.ts`, `problem.test-d.ts`), the brands (`env.test-d.ts`, `request-guard.test-d.ts`, the hono and start type tests, `core/src/env.test.ts`), `coreInstall`, and the stricter readers (`env.test.ts`). The layer rows for `@robkit/input` went red in `tooling/eslint/layers.test.js` first.
- Core's and dev's suites, Docker included, pass in WSL: dev 75 tests, core 240.
- CI's `gate` job passes: https://github.com/RobertScholey98/robkit/actions/runs/42164112581. The first run failed only on the coverage ratchet, which asked for session's lines threshold to go from 97 to 99. It now does.

### What I couldn't check

- The whole-stack test (`tooling/e2e`) didn't run locally, because other tickets were running alongside. CI's `check` job ran it as part of the full gate.

### For ticket 17 (`GLOSSARY.md`)

- Consider entries for **core's origin** (`CoreOrigin`, such as `https://core.robkit.dev`) and **the install's domain** (`Domain`). Both are now brands in `@robkit/input`.

### For ticket 18 (docs it owns)

- `README.md`: add `@robkit/input` to the package table: "readers for input from outside robkit: env, JSON, slugs, the manifest; `InputProblem` and `orThrow`".
- `AGENTS.md`, the layer rule: "`@robkit/input`, `@robkit/session` and `@robkit/guard` import no framework, and the guard and input do no I/O." Under "Where things are", `packages/` now includes `@robkit/input`.
- `docs/architecture.md`: line 167 names `packages/session/src/install-addresses.ts`, now `packages/session/src/addresses.ts`. Line 168 names `packages/session/src/manifest.ts` (`@robkit/session/manifest`), now `packages/input/src/manifest.ts` (`@robkit/input`). The package map should show `@robkit/input` under session and the guard.
- `packages/session/README.md`: its first paragraph, the `./addresses` exports table (`readSlug`, `Slug`, `slugProblem`, `platformApps` and `isPlatformApp` moved to `@robkit/input`; `coreInstall` is new), the paragraphs on `./input`, `./app-env` and `./manifest`, and the matching "For contributors" bullets all describe entries that are gone. Its example's `if (isProblem(options)) throw ...` can be `orThrow(readGuardEnv(process.env))`.
- `packages/hono/README.md` (lines 20 and 39) and `packages/start/README.md` (line 25): the read-and-throw pairs can use `orThrow`. `GuardedOptions.core` is now a `CoreOrigin`.
- `packages/guard/README.md`: I changed its two examples and two export rows, because the readers now return `InputProblem` and the examples stopped compiling. Its "depends on nothing" wording, if any, should say it depends on `@robkit/input`.
- `docs/adr/0011-pure-guard-thin-adapters.md` says the guard imports nothing; it now imports `@robkit/input`, which imports nothing.

### For ticket 19

- `@internal/test-session` depends on `@robkit/input`. `FakeCore.origin` is a `CoreOrigin`, made with `orThrow(readCoreUrl(...))`. The guard's readers return `InputProblem`, so a brand builder uses `orThrow(readRoleId(...))` rather than `known`. `known` is now used only by its own test.
- Session has a test helper, `src/test/core-origin.ts`, that reads a URL as a `CoreOrigin`.
