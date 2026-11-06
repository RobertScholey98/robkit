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

**Status:** ready-for-agent

- [ ] The input readers live in their own package, and session holds sessions only
- [ ] Every reader returns `InputProblem`, or the convention doc says which kind returns what
- [ ] `CoreOrigin` and `Domain` are brands, with type tests, and `installOf`'s runtime check is gone
- [ ] `readDomain` and `readHost` refuse bad lengths and punctuation
- [ ] The templates use `orThrow`
- [ ] The PR's CI `gate` job passes on GitHub
