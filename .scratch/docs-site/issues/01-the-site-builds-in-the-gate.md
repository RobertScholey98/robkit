# 01: The site builds in the gate

**What to build:** A `site/` package in the workspace that Astro builds to static files, with one page, and the gate building it. Nothing is designed yet. This ticket proves the site is a citizen of the repo before anything is built on it.

- **The package.** Private, never published, in `site/`, added to the workspace. Astro with MDX, static output. Every version it needs is in the catalog as an exact version, none published in the last day.
- **One page.** A home page with robkit's one-sentence description and the three commands from the README's quickstart, as plain HTML.
- **In the gate.** The site has `build`, `typecheck`, `lint`, `test` and `test:unit` scripts, and `pnpm check` runs them through turbo, with no Docker. `test:unit` needs no browser. A test builds the site and checks the page is there with its commands.
- **The repo's own checks pass with it.** knip, the package graph, the catalog check, the coverage threshold checks and Prettier each know the package. Astro files are linted and formatted, or the ticket's comments say why one kind is left out.
- **CI keeps what it built.** The pull-request job uploads the built folder as an artifact of the run, so a reviewer can open it.
- **How to run it.** `CONTRIBUTING.md` gains the commands that build and serve the site locally.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] `pnpm --filter <the site> build` writes static files, and a test checks the home page holds the three commands
- [ ] `pnpm check` builds, typechecks, lints and tests the site, and fails when the page doesn't build
- [ ] `pnpm knip`, the package graph check, the catalog check and `pnpm format:check` pass with the package in place
- [ ] No version the site adds was published in the last day, and none is exempted from pnpm's release-age rule
- [ ] CI's run of the pull request has the built site as an artifact
- [ ] `CONTRIBUTING.md` says how to build and serve the site
- [ ] The PR's CI `gate` job passes on GitHub
