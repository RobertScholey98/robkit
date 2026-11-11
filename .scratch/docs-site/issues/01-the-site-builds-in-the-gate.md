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

**Status:** ready-for-agent

- [ ] `pnpm check` builds, typechecks, lints and tests the site, and fails when the page doesn't build
- [ ] A test checks the built home page holds the README quickstart's three commands
- [ ] A test shows the package graph, package-scripts and coverage checks each list the site among the packages they read
- [ ] `pnpm knip`, the catalog check and `pnpm format:check` pass with the package in place, and a staged file under `site/` is linted by the pre-commit hook
- [ ] No version the site adds was published in the last day, none is exempted, and no catalog entry the templates use changed version
- [ ] Changing a file outside `site/` that the site reads makes turbo run the site's build again
- [ ] CI's `check` job has the built site as an artifact
- [ ] `CONTRIBUTING.md` says how to build and serve the site, and how to view the artifact
- [ ] The PR's CI `gate` job passes on GitHub
