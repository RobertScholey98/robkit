# 26: Brands all the way through, and session holds only sessions

**What to build:** A value that has been read keeps its brand until the code that uses it. `@robkit/session` holds sessions and nothing else, and one word names each concept.

Today:
- `createApp` and `InstallOptions` take `domain: string`, so the `Domain` brand is lost after env parsing.
- Core passes slugs around as plain `string`.
- `InputProblem` is structural, so any `{ error }` passes `isProblem`.
- `@robkit/session` still holds the install address helpers and `Report`, so dev and create-robkit depend on session for those alone.
- `@robkit/input` exports 33 declarations from one entry.
- The glossary's "Manifest" is `AppManifest`, `AppDeclaration` and `DeclaredApp` in code.
- `Database extends Connection {}` needs a lint disable.

Raises rubric categories 2 (public API), 1 (module boundaries), 3 (type safety) and 4 (naming). Evidence: `../research/council-r3-opus.md` sections 1 to 4; `../research/council-r3-sol.md` section 2; `../research/council-r3-sonnet.md` section 2.

- **`Domain` and `Slug` through core.**
  - `CoreOptions.domain` in `packages/core/src/app.ts`, and `InstallOptions` in session's addresses, take `Domain`. Thread it through `access-codes.ts`. Add `packages/core/src/app.test-d.ts` with `@ts-expect-error` on a plain string.
  - Core reads the slug at its route boundary with `readSlug` and answers 404 on a problem. `accessOf` and `setAccess` take `Slug`.
- **A nominal `InputProblem`.** It has a `unique symbol` property, readers build one only through a `problem(message)` helper, and `isProblem` checks the symbol.
- **Session holds only sessions.** Move `addresses.ts` and `report.ts` out of session, into `@robkit/input` or a new zero-dependency package; record which and why in Comments. Drop the dev-to-session and create-robkit-to-session edges in `package-graph.js` where nothing else needs them.
- **Input's entry.** Move the manifest format to an `@robkit/input/manifest` subpath, so the root is the reading primitives.
- **One word for the manifest.** Rename `AppDeclaration`, `readAppDeclaration` and `appDeclarationJson` to `AppManifest`, `readAppManifest` and `appManifestJson`, and fold dev's file-level type into input's or name it to match. Add "declaration" to the Manifest entry's Avoid list. You own `GLOSSARY.md` this round.
- **`Database`.** Make it a branded alias or a plain alias without the lint disable.
- **Commits and docs.** Renames and moves go in their own commits. Update the API reports and add changesets. Make the README import changes your moves force, and list other doc edits for ticket 25.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Core and the address helpers take `Domain`, and core's access functions take `Slug`, with type tests
- [ ] `InputProblem` is nominal, and only `problem()` makes one
- [ ] Session holds sessions only, and the graph lost the edges nothing needs
- [ ] The manifest has one name and its own subpath
- [ ] The PR's CI `gate` job passes on GitHub
