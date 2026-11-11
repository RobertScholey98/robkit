# 22: Reference: the packages

**What to build:** A short page for each package an app imports from: the four adapters, `@robkit/drizzle`, `@robkit/react`, `@robkit/vite`, `@robkit/serve` and the Go module. Each says what the package is for, shows the common use in an example that compiles, explains the options a builder reaches for, and links to the package's README and `api-report.md` on GitHub for every signature. The pages don't copy every type.

- **The rest, on one page.** `create-robkit`, `@robkit/core`, `@robkit/dev`, `@robkit/provision`, `@robkit/input`, `@robkit/guard` and `@robkit/session` each get a paragraph and a link. An app's author rarely imports them. The hub and admin in every install do import `@robkit/input` and `@robkit/guard`, and the page says so.
- **Held to the API reports.** For the TypeScript packages with a page of their own, a test compares the names the page lists with the exports in `api-report.md`, both ways.
- **The Go module** has no API report. Its page lists the exported names of its packages, and a test compares them with what `go doc` prints. Its example compiles against the module in the repo.

**Blocked by:** 03, 05

**Status:** done

- [x] Each package an app imports from has a page with an example that compiles
- [x] An export added to one of those packages and not to its page fails a test, and so does a name on the page the package no longer exports
- [x] The Go page's names are the ones `go doc` prints, held by a test that runs where Go is installed
- [x] The page for the rest names every other published package
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- Ten pages under Reference, orders 4 to 13:
  - `robkit-hono`, `robkit-express`, `robkit-next` and `robkit-start`
  - `robkit-drizzle`, `robkit-react`, `robkit-vite` and `robkit-serve`
  - `go-module`, then `other-packages`
- Each package's page has the same parts:
  - what the package is for, and the common use as an example
  - "Options you reach for"
  - "What it exports", with an `###` heading for each entry point and a list item for each export
  - a last line that links to the package's README and `api-report.md` on GitHub
- A list item names its exports before its first full stop, so related ones share an item, such as "`owner()`, `guest(options?)` and `nobody()`."
- `PackageLinks.astro` writes that last line from `repoUrl`.
- The glossary avoids "plugin" outside Vite's own files. So the `@robkit/vite` page shows the React + Hono and Express templates' `vite.config.ts` with `<TemplateFile>`, which reads them as the site builds, and its prose doesn't say "plugin".
- The ticket says the hub and admin both import `@robkit/input` and `@robkit/guard`. Their source says otherwise. The hub imports `@robkit/input`, and admin imports `@robkit/input` and `@robkit/guard`. Both list `@robkit/session` in `package.json` but don't import it. The page says what the source does, and a test holds it there.
- The other-packages page doesn't name `npm create robkit`. It links to that page as "making an install", so it needs no pre-release line.

**Proof**

- `site/src/reference-packages.test.ts`:
  - For each TypeScript package page, the names under each entry point must equal the exports `api-report.md` gives that entry point. A unit test covers the report reader on each kind of export line.
  - Each of those pages links to the package's README and API report.
  - The other-packages page has an `##` section for every published package without a page of its own, read from `packages/*/package.json`. Its sentences on which of the hub and admin import `@robkit/input`, `@robkit/guard` and `@robkit/session` match those apps' source.
  - Where Go is installed, the Go page's names under each package must equal the funcs, types, consts and vars `go doc -all` prints. Its `main.go` must pass `go vet` in a module that replaces the Go module with the repo's `go/`.
- I took `GuardedEnv` off the Hono page, added a `ghost()` the React package doesn't export, dropped `@robkit/provision` from the other-packages page, and swapped who imports `@robkit/guard`. Then I rebuilt. Four tests failed, each on its own change, and passed once I put the pages back.
- In WSL with Go 1.27.3, in a clone of this branch, all 21 tests pass, the 2 Go ones included. `site-fences.test.ts` passes there too, so gofmt accepts the Go page's example. CI's `check` job installs Go 1.27.3, so it runs them.
- `doc-examples.test.ts` compiles every TypeScript fence on the new pages against the built packages, and passes. The Vite page's two examples are template files, which the templates' own checks compile.
- A browser test runs axe on the ten pages at both widths in both themes, and checks none scrolls sideways on a phone.
- `turbo.json` takes `packages/*/api-report.md` and `packages/*/package.json` as inputs of the site's build, test and test:unit.
- In `site/`, `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, with 408 tests and the 2 Go tests skipped on Windows. The repo's glossary test passes.

**What the next tickets need**

- An export added to a package with a page fails `reference-packages.test.ts` until the page lists it. Run `api:update` first, then add the name under its entry point.
- The Reference section now has 13 pages, so ticket 23's search and ticket 24's link previews have more to cover.

**What milestone 4 and ticket 26 change**

- Nothing here depends on `robkit deploy` or `robkit check`. A new export or a renamed one in milestone 4 shows up in this test.
