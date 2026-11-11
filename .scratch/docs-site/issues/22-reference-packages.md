# 22: Reference: the packages

**What to build:** A short page for each package an app imports from: the four adapters, `@robkit/drizzle`, `@robkit/react`, `@robkit/vite`, `@robkit/serve` and the Go module. Each says what the package is for, shows the common use in an example that compiles, explains the options a builder reaches for, and links to the package's README and `api-report.md` on GitHub for every signature. The pages don't copy every type.

- **The rest, on one page.** `create-robkit`, `@robkit/core`, `@robkit/dev`, `@robkit/provision`, `@robkit/input`, `@robkit/guard` and `@robkit/session` each get a paragraph and a link. An app's author rarely imports them. The hub and admin in every install do import `@robkit/input` and `@robkit/guard`, and the page says so.
- **Held to the API reports.** For the TypeScript packages with a page of their own, a test compares the names the page lists with the exports in `api-report.md`, both ways.
- **The Go module** has no API report. Its page lists the exported names of its packages, and a test compares them with what `go doc` prints. Its example compiles against the module in the repo.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Each package an app imports from has a page with an example that compiles
- [ ] An export added to one of those packages and not to its page fails a test, and so does a name on the page the package no longer exports
- [ ] The Go page's names are the ones `go doc` prints, held by a test that runs where Go is installed
- [ ] The page for the rest names every other published package
- [ ] The PR's CI `gate` job passes on GitHub
