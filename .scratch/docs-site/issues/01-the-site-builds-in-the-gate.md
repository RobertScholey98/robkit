# 01: The site builds in the gate

**What to build:** A `site/` package in the workspace that Astro builds to static files, with one page, and both gates building it. Nothing is designed yet. This ticket proves the site is a citizen of the repo before anything is built on it.

- **The package.** Private, never published, in `site/`, added to the workspace. Astro with MDX, static output.
- **Its versions.** Every version it needs is in the catalog as an exact version, none published in the last day, and none exempted from pnpm's release-age rule. Don't change the version of a catalog entry the templates use: an install's catalog takes robkit's versions for those names, so raising one changes every new install. If Astro needs a newer Vite than the catalog pins, let Astro bring its own and say so in the comments.
- **One page.** A home page with robkit's one-sentence description and the three commands from the README's quickstart, as plain HTML.
- **Both gates build it.** `pnpm check` runs `turbo run lint typecheck test:unit`, and turbo builds only what a task depends on, so today nothing would build the site. Make the site's `test:unit` and `test` depend on its own `build` in `turbo.json`, so each gate builds the site once and its tests read that output. `test:unit` needs no browser and no Docker. A test checks the built page is there with its commands.
- **The repo's checks find it.** The package graph, the package-scripts check and the coverage threshold checks look only under `packages/` and `tooling/` today, so they would pass without ever reading the site. Make each find `site/`, and add the site to `tooling/eslint/package-graph.js`. knip, the catalog check, Prettier and the pre-commit hook's ESLint cover it too. Astro files are linted and formatted, or the comments say why one kind is left out. Check early whether Prettier formats the site's MDX. If it can't, `.prettierignore` leaves those files out, with the reason in the comments.
- **Turbo knows what the site reads.** List as `inputs` of the site's `build`, `test` and `test:unit` every file outside `site/` that a page or a test reads. Each later ticket that reads a new one adds it there. Without that, a local gate answers from cache after `GLOSSARY.md` changes.
- **Ignored folders.** Astro's generated `.astro/` folder is in `.gitignore`.
- **CI keeps what it built.** The `check` job, which is the one that builds, uploads the built folder as an artifact after `pnpm check:all`.
- **How to run it.** `CONTRIBUTING.md` gains the commands that build and serve the site, and how to look at a run's artifact: unzip it and serve the folder, since its links start at the root and break when a page is opened as a file.

**Blocked by:** none

**Status:** done

- [x] `pnpm check` builds, typechecks, lints and tests the site, and fails when the page doesn't build
- [x] A test checks the built home page holds the README quickstart's three commands
- [x] A test shows the package graph, package-scripts and coverage checks each list the site among the packages they read
- [x] `pnpm knip`, the catalog check and `pnpm format:check` pass with the package in place, and a staged file under `site/` is linted by the pre-commit hook
- [x] No version the site adds was published in the last day, none is exempted, and no catalog entry the templates use changed version
- [x] Changing a file outside `site/` that the site reads makes turbo run the site's build again
- [x] CI's `check` job has the built site as an artifact
- [x] `CONTRIBUTING.md` says how to build and serve the site, and how to view the artifact
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- The package is `@internal/site` in `site/`, with Astro 7.4.8 and `@astrojs/mdx` 8.1.3. Astro takes Vite `^8.3.6`. The catalog pins `vite` at 8.3.5 for every install, so Astro brings its own Vite and the catalog's `vite` is unchanged. The catalog says so above `astro`.
- The home page reads the README's quickstart commands as it builds, so the two can't say different things. `quickstartCommands()` in `site/src/readme.ts` takes the first `sh` fence under "## Quickstart". The build fails, naming the README, when there is none.
- A page reads a file outside `site/` with `readRepoFile("<path from the repo root>")` from `site/src/repo.ts`. `turbo-inputs.test.ts` finds every `readRepoFile("...")` written out in `site/src`, and fails when its path isn't among the turbo inputs of the site's `build`, `test` and `test:unit`. It also fails when those three tasks' inputs differ. A later ticket that reads a new file adds it to all three. The test can't see a path built at run time, such as a template file a page names, so list that folder by hand.
- `packageFolders` in `tooling/eslint/package-graph.js` is the one list of where JavaScript packages live. The graph check, the package-scripts check, the coverage checks and the layer rule read it, and a test fails when it and `pnpm-workspace.yaml` part. The layer rule's `workspaceOf` now knows a workspace one folder deep, such as `site`, so the core row and the relative-import row apply to the site.
- The repo checks' turbo inputs gained `site/**`, without `.astro/`, since the checks read the site's `package.json` and source. Ticket 04 still has to make the doc-examples and glossary checks read the pages.
- Astro's telemetry is off. `astro.config.ts` sets `ASTRO_TELEMETRY_DISABLED` where nothing has, as `withRobkit()` does for Next. `astro build` records its event only after it loads the config. `astro dev` records an empty one before, which sends nothing.

**What is linted and formatted.**

- `.ts` and `.js` files get the repo's ESLint policy. `.astro` files get `eslint-plugin-astro`'s recommended rules and the policy's rules that need no types, since TypeScript's project service can't read an `.astro` file. `astro check && tsc` types both.
- Prettier formats `.astro` files with `prettier-plugin-astro`, which `site/prettier.config.js` resolves from the site.
- MDX is left out of both. Prettier reads MDX as MDX 1. On an MDX 3 page it moved a component's closing tag into the list the component held, which changes the page, and `.prettierignore` says so. ESLint has no MDX parser here. The checks ticket 04 points at the pages read their code fences, words and commands, which is what an MDX page holds besides prose.
- The graph check's import scan reads `.ts` and `.js` files, not `.astro` frontmatter. The layer rule does read `.astro` files, so an `.astro` import of `@robkit/core`, or a relative path out of `site/`, still fails lint.

**For the next ticket.**

- `test:unit` and `test` are the same Vitest run today. Ticket 02 puts the Playwright tests in `test` only.
- `astro check` runs `astro sync`, which writes `.astro/`. `lint` doesn't need it yet, because no `.ts` file imports an `astro:` module. Once one does, the site's `lint` must run after `astro sync`.
- `findRepoRoot` starts from the working folder, which pnpm sets to `site/`. Astro bundles each page before it runs it, so a page can't find the repo from `import.meta.url`.
- `pnpm --filter @internal/site preview` serves `site/dist` on port 4321.

### Merged

Added by the lead. PR 100 merged into `docs-site` on 2026-11-11, with `gate` green on `5fc4b74`. Two earlier runs failed on things outside the site:

- `vendor.pack.test.ts` in `create-robkit` passed its 120 second limit. Its two tests each build and pack every package, and they ran side by side. They now run one after the other (`52cada4c`).
- Docker Hub answered 502 when `tooling/test-postgres` pulled `postgres:18-alpine`. A re-run of the failed job passed.
