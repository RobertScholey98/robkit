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

**Status:** done

- [x] A `ts` fence in a site page that doesn't compile fails the doc-examples check, which names the page and line
- [x] A `tsx` fence that imports React compiles
- [x] A word the glossary avoids, in an MDX page and in an `.astro` page, fails the glossary check, and `site/DESIGN.md` doesn't
- [x] `pnpm robkit nothing` in a `sh` fence fails a test, and so does `pnpm` with a script the install doesn't have
- [x] A `go` fence that `gofmt` would change fails a test
- [x] Changing only a site page makes turbo run the repo checks again
- [x] The exported list of commands has a changeset and is in create-robkit's API report
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- `tooling/repo-checks/src/site-pages.ts` holds the site's page globs: `site/src/content/**/*.mdx` and `site/src/pages/**/*.{astro,mdx}`. The doc-examples check, the glossary check and the new fence checks all read them, so they can't disagree about which pages count. `site/DESIGN.md`, the config, `dist`, `.astro` and `node_modules` are outside those globs.
- `fencesIn()` in `doc-examples.ts` reads every fence in a doc, with its language and flags. The `ts`/`tsx` check and the `sh`/`go` checks both use it.
- `site-fences.ts` checks the `sh` and `go` fences. In an `sh` fence, it splits each line at `&&`, `||`, `;` and `|`, drops a leading `$ ` and a `#` comment, and reads each part that starts with `pnpm`:
  - `pnpm robkit <command>` must be one of `robkitCommands` from create-robkit. `pnpm robkit` with no command fails too.
  - `pnpm <name>` and `pnpm run <name>` must be a script in `packages/create-robkit/templates/base/package.json`, unless `<name>` is one of pnpm's own commands: install, i, add, remove, update, exec, dlx, why, list, outdated. A flag such as `pnpm --version` passes.
  - Commands that don't start with `pnpm`, such as `npm create robkit` and `cd`, aren't checked.
- The `go` check pipes each fence to `gofmt -l`. A fence gofmt would change, or can't parse, fails with the page and line. With no `gofmt` on the `PATH`, the test throws and says to install Go, as CONTRIBUTING.md asks. CI has Go.
- create-robkit exports `robkitCommands`, `isRobkitCommand` and `RobkitCommand` from `src/robkit-commands.ts`, which does nothing on import. `robkit-command.ts` maps each one to its handler with `satisfies Record<RobkitCommand, ...>`, so a command added to one list and not the other fails the typecheck. The changeset is a patch.
- repo-checks has `react` and `@types/react` as dev dependencies, so a `tsx` fence can import React. Both are in knip's `ignoreDependencies`. Next and TanStack Router aren't added yet. The ticket that first shows one of their imports adds it.
- The glossary check has two new exceptions for the site's pages, each Docker's own name: "Compose plugin" and "WSL integration". No page says "middleware" yet.
- `/samples/` (`site/src/pages/samples.mdx`) holds one `ts`, `tsx`, `sh` and `go` fence. `BaseLayout` has a `noindex` prop, which writes `<meta name="robots" content="noindex">`. The page isn't in the docs collection, so the sidebar and the pager don't list it.

**Proof.**

- The unit tests in `doc-examples.test.ts`, `glossary.test.ts` and `site-fences.test.ts` cover each failure: a `ts` fence that doesn't compile, named by page and line; a `tsx` fence importing React that compiles; an avoided word in an MDX page and an `.astro` page, with `site/DESIGN.md` not read; `pnpm robkit nothing`; `pnpm start`; Go with spaces for tabs; and Go that doesn't parse.
- On the real samples page, in WSL with Go, I swapped `pnpm dev` for `pnpm robkit nothing` and `pnpm start`, and the test named lines 44 and 45. I swapped a tab in the Go for spaces, and it named the fence at line 50. Then I put the page back.
- `turbo run --dry=json` gave `@internal/repo-checks#test:unit` the hash `c1b6294f7ee65045`. With one line added to `what-you-need.mdx` it was `8085d86e67c1d2ad`. A file added to `site/dist` left it at `c1b6294f7ee65045`. `@internal/repo-checks#test` moved from `8b3356e31d628132` to `79b493a7d451582f` when `samples.mdx` changed. Both tasks already listed `site/**` from ticket 01, so `turbo.json` didn't change here.
- `built-site.test.ts` checks that `/samples/` is built with `noindex` and a `go` fence, that the docs sidebar doesn't link to it, and that the home page has no `noindex`.

**For the next tickets.**

- Ticket 05 makes the code blocks. The checks read fences by their language word, so a page must use `ts`, `tsx`, `sh` or `go` for its code to be checked. A fence marked `ts nocheck` is skipped. Other words, such as `text` or `bash`, aren't checked at all.
- A page that shows the checkout route's `pnpm create-install` will fail the `sh` check, since it's a script of the robkit repo, not of an install. Add an exception in `site-fences.ts` with a reason when that page is written.
- A sample that imports Next or TanStack Router needs that package in repo-checks' dev dependencies and in knip's `ignoreDependencies`, from the catalog.
- Ticket 24 must leave `/samples/` out of the sitemap and `llms.txt`. Search (ticket 23) must leave it out of its index.
- The Go check needs `gofmt`. On Windows without Go, `site-fences.test.ts` fails like the repo's other Go tests. Run it in WSL.

**What milestone 4 will change on these pages.**

- If milestone 4 adds a `robkit` command, `robkitCommands` gets it, and the typecheck makes sure the handler is there too. Pages may show it at once.
- If it adds or renames a script in the install's `package.json`, the `sh` check follows it with no edit here.
