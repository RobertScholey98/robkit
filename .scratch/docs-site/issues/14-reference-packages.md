# 14: Reference: the packages

**What to build:** A page for each package an app or an install imports from: the adapters, `@robkit/drizzle`, `@robkit/react`, `@robkit/vite`, `@robkit/serve` and the Go module. Each has what the package is for, an example that compiles, and its exports with their options, from the package's README and `api-report.md`.

Packages an owner never imports (`@robkit/input`, `@robkit/guard`, `@robkit/session`, `@robkit/provision`, `@robkit/dev`, `@robkit/core`) get one page between them that says what each is and links to its README.

A test fails when a package's entry in `api-report.md` exports a name its page doesn't mention.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Each package an app imports from has a page with a compiling example
- [ ] Every export in those packages' API reports is named on its page, and a new export without a mention fails a test
- [ ] The page for the packages an owner never imports lists every other published package
- [ ] The PR's CI `gate` job passes on GitHub
