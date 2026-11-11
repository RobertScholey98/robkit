# 04: The repo's checks read the site

**What to build:** The checks that keep the repo's docs true, pointed at the site's pages, before any page with code is written.

- **Which files.** The doc-examples check and the glossary check read only `.md` files today. Both read the site's pages a reader sees: the MDX under its content folder and the `.astro` and `.mdx` files under its pages folder. They don't read `site/DESIGN.md`, the Astro config, `dist`, `.astro` or `node_modules`.
- **Examples compile.** Every `ts` and `tsx` fence in a site page compiles against the built packages, as the fences in `README.md` do. `nocheck` marks a deliberate fragment. The check compiles each fence as a module on its own, with imports resolved from `tooling/repo-checks`, which has no React, Next or router today. Add what the site's samples import to its dev dependencies, and to its `ignoreDependencies` in `knip.jsonc`.
- **Commands exist.** A test reads each `sh` fence in the site's pages. It fails on `pnpm robkit <name>` where `<name>` isn't one of `robkit`'s commands, and on `pnpm <script>` where the script isn't one the install's `package.json` in the templates has. Prior art: the README test in create-robkit's `generate.test.ts`. The usage text of `robkit` is private to a module that runs the command when imported. Export the list of commands from a module that does nothing on import, in a commit of its own with a changeset. The PRD allows that.
- **Go is formatted.** A test runs `gofmt -l` on each `go` fence.
- **Words are checked.** The glossary check reads the same pages. Where a stack's own word is one the glossary avoids, such as "middleware", the exception goes in `glossary.ts` with a glob for the site's pages and a reason.
- **Turbo runs them.** The repo-checks tasks list their inputs in `turbo.json`, and `site/` isn't among them, so a change to a page alone would be answered from cache. Add the site's source to both tasks' inputs, without `dist` and `.astro`.
- **A samples page.** A page in the site holds one of each kind of fence for these tests. It is marked `noindex` and left out of the navigation, the sitemap, search and `llms.txt`. It stays in the build, so the site that is tested is the site that is published.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A `ts` fence in a site page that doesn't compile fails the doc-examples check, which names the page and line
- [ ] A `tsx` fence that imports React compiles
- [ ] A word the glossary avoids, in an MDX page and in an `.astro` page, fails the glossary check, and `site/DESIGN.md` doesn't
- [ ] `pnpm robkit nothing` in a `sh` fence fails a test, and so does `pnpm` with a script the install doesn't have
- [ ] A `go` fence that `gofmt` would change fails a test
- [ ] Changing only a site page makes turbo run the repo checks again
- [ ] The exported list of commands has a changeset and is in create-robkit's API report
- [ ] The PR's CI `gate` job passes on GitHub
