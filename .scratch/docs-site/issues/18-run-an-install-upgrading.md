# 18: Run an install: upgrading

**What to build:** The page on `pnpm robkit upgrade`: what it changes and never changes, what it refuses and why, the two steps in a sentence, the changelog it prints, that Ctrl+C puts the files back, and the commands that undo one stopped any other way.

Until the first release there is nothing to upgrade to, and the page says so with the pre-release line.

**Blocked by:** 03, 05

**Status:** done

- [x] The undo commands are the ones the install's README gives, shown from the template or held by a test that fails if they differ
- [x] Each refusal the page names is one the code makes
- [x] The files the page says upgrade writes are the ones the code writes, and the Proof names where
- [x] The install's README is among the turbo inputs of the test that reads it
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- One page, `run-an-install/upgrading`: Run it / What it changes / What it never changes / When it refuses / If it stops partway.
- The two steps get one paragraph under Run it. The robkit the install has checks, moves `create-robkit` alone and installs it, then the new robkit does the rest.
- Until the first release, a note under the intro says there's nothing to upgrade to. It quotes the line `robkit upgrade` prints in an install made from a clone. `<BeforeRelease>` drops the note once `preRelease` is off. The page doesn't show `npm create robkit`, so it doesn't carry `<PreRelease />`.
- The page's two `sh` fences are typed out, not read with `<TemplateFile>`. They sit in the install's README, a Markdown file, so `<TemplateFile>` would frame them as `README.md` in Markdown. A test holds them to the README instead.
- The changelog isn't shown as an example. Nothing is on npm, so there's no real one to quote. The page says what the output holds, in the order `finishUpgrade` prints it, and quotes its last line.

**Proof**

- New built-site tests:
  - They take the two `sh` fences under the install README's "Upgrade robkit" and check the page shows both, the undo commands among them. They also check the page has the README's sentence on what an upgrade never reaches.
  - They read `ownedPaths` and `ownedFolders` from `upgrade-handover.ts`, the five paths an upgrade writes and puts back, and hold the page's list under What it changes to them, in order. Breaking `pnpm-lock.yaml` in the built page made that test fail.
  - Each one-line block the page quotes must be in `upgrade.ts`, and the "Next, read git diff" line must be one of them.
  - They also check the page isn't a stub.
- The files upgrade writes: `ownedFiles` and `ownedFolders` in `upgrade.ts`, and `ownedPaths` in `upgrade-handover.ts`. `finish` writes `pnpm-workspace.yaml` and `package.json` and replaces the two folders, and `pnpm install` writes `pnpm-lock.yaml`. `upgrade.test.ts`'s "replaces the lint policy and the Go module whole, and changes no file under apps" and "writes no Go module in an install with no Go app" hold it.
- Each refusal has a test in `upgrade.test.ts`. "robkit upgrade's checks" covers no git, no commit, changed and untracked files and links, and the upgrade tests cover a version that isn't one, one the registry lacks, the same, older and a registry that fails. Ctrl+C has its own test, "puts every file back when Ctrl+C stops pnpm install".
- In WSL, in an install made with `pnpm create-install --stack react-hono` from this branch, with Postgres on port 25440:
  - As made, `pnpm robkit upgrade` printed the page's "This install links to a robkit checkout" line and exited 0.
  - With no `.git`, it refused and gave the README's three commit commands. I ran them, and they made the commit.
  - With the overrides in `pnpm-workspace.yaml` swapped from `link:` to `0.1.0` and committed, it refused:
    - a changed `README.md` and an untracked `notes.txt`, naming each as "not committed" and "untracked"
    - `latest`, with "isn't a version"
    - while `pnpm dev` ran, with the `pnpm dev` message
    - `0.0.0-nope`, after "Asking the registry", with the registry's 404 and `pnpm config get registry`
  - No run changed a file.
  - A link at `tooling` I couldn't run. The install's own pre-commit hook fails to commit a folder swapped for a link, so the upgrade saw the change as not committed. The unit tests hold the link refusals.
- The install README's turbo input: `@internal/site#test` and `@internal/site#test:unit` in `turbo.json` take `packages/create-robkit/templates/**`, which holds `templates/base/README.md`.
- `run-an-install.browser.test.ts` runs axe on the page at 375 and 1280 pixels in both themes, and checks it doesn't scroll sideways at 375 pixels.
- The site's build, lint, typecheck and all 254 tests pass at 100% coverage.

**What the next tickets need**

- `itemsAfter(html, id)` is now a top-level helper in `built-site.test.ts`. It reads the first list after a heading.
- Astro's build turns `'` into `’` in prose, so a test that compares a page's sentence to a source file swaps them back first.
- `run18.sh` and `run18b.sh` in the scratchpad swap an install's `link:` overrides for a version, so the checks a registry install gets run. Don't let one reach `pnpm install`, since nothing is on npm.
- Ticket 26: once robkit is on npm, run a real upgrade between two published versions, and show its output and changelog on the page if they read well.
