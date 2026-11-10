# 15: `npm create robkit` installs and says what's next

**What to build:** After `npm create robkit my-install` today, the owner has a folder and has to know to run `pnpm install` and `git init` before anything works. Next.js and Create React App finish the job and print the next command. init should too, and its failures should say how to carry on.

- **init installs.** `npm create robkit` installs dependencies and makes the first commit unless told `--no-install`. This reverses app-sharing ticket 01's `--install` flag; record that in the map. The checkout's `pnpm create-install` script, which passes `--install` today, changes to match.
- **It checks what it needs first.** Before writing anything it checks Node is 24 or later and that pnpm can run. The Node check sits in the command's entry file and runs before that file loads anything, so an older Node prints the message and not a syntax error. A static `import` runs first wherever it is written, so the entry file has none: it checks, then loads the command with `await import()`. Where pnpm is missing it says how to get it: `corepack enable` where Corepack exists, and `npm install -g pnpm` where it doesn't, since newer Node ships none. A pnpm too old to run the version the install's `packageManager` names stops init the same way, with what to run. A missing Docker is a warning, since only `pnpm dev` needs it. A Go stack still needs Go, as today.
- **The first commit can't spoil the install.** Where git isn't installed, has no name or email set, or the commit fails for any other reason, init says so in one line and carries on. The commit doesn't run the install's pre-commit hook.
- **It says what's next.** On success it prints the folder, then `cd <folder>` and `pnpm dev`, and the hub's address to open first. Nothing else.
- **A failed install can be finished.** When `pnpm install` fails, init says the files are written and to run `pnpm install` in the folder, and doesn't say "try again", which would hit "isn't empty". `robkit add` writes the app's folder in one move, so an interrupted add leaves nothing half-written, and says the same when its install fails. It builds the folder in `.robkit/` in the install, which git ignores, and renames it into `apps/`. The runner and pnpm both read `apps/`, so a half-written folder there would break each.
- **An install has a README.** It says what the install is, the commands an owner uses, where each app lives, how to start the local database again from nothing, and where to read more. The base template has none today.
- **`robkit add` refuses an icon the manifest would.** `--icon` and the wizard's icon question use `readAppManifest`'s own rule, so `robkit add notes --icon memo` fails at once and not at the next `pnpm dev`.
- **Template overrides keep their bytes.** A file in an install's `robkit/templates/<stack>` that isn't UTF-8 text, such as an image, is copied as it is.
- **The wizard.** With no arguments init still asks for the folder and the example's stack, and prints the command that skips the questions.
- **Docs.** The repo's `README.md` quickstart and create-robkit's README. The quickstart says `npm create robkit` and keeps the from-a-clone path for contributors.

**Blocked by:** 13, 16

**Status:** done

- [x] `create-robkit my-install` with no flags writes, installs and commits, and prints the next commands and the hub's address
- [x] `--no-install` writes only, and prints the install command first
- [x] On Node 22, with no pnpm, or with a pnpm too old for the install's `packageManager`, init stops before writing and says how to fix it
- [x] The entry file has no static import, with a test that reads it, and the Proof shows the message from a real Node 22
- [x] With no git identity, and with no git, init finishes, skips the commit and says so
- [x] A failing `pnpm install` leaves a message that names the folder and the command to finish with
- [x] An add whose write fails partway leaves nothing under `apps/`
- [x] A new install has a `README.md`, and the generator's tests check its commands exist in `package.json`
- [x] `robkit add notes --icon memo` fails with the manifest's message and writes nothing
- [x] An image in a template override arrives byte for byte
- [x] The repo README's quickstart is the three commands
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Neither had a must-change here. I checked each point against the code and took these:

- **This ticket now waits for 16 too** (Sol). Both change `packages/create-robkit/src/robkit-command.ts`: 16 for a run outside an install and for `turbo ls`, this one for init and add.
- **The entry file can have no static import** (Opus). The ticket said the check runs before the file imports anything, which a static import makes impossible.
- **The pnpm on the machine may not be the install's** (both). The install's `packageManager` names one version. Find out which pnpm versions switch to it by themselves, and stop on one that doesn't.
- **A missing git has its own criterion** (Sol), and any other failed commit is the same one-line note (Opus).
- **An add is staged outside `apps/`** (both). `writeInstall` in `write.ts` writes file by file, so "one move" needed a place to build the folder first.

### From the build, 2026-11-10

Built on branch `91-init-installs`, one commit per change.

**Chosen in the build:**

- **`--no-install` makes no repository.** It writes files only, and its next steps are `cd <folder>`, `pnpm install` and `pnpm dev`, with no `git init`. Husky sets its hook up on the first `pnpm install` in a repository, so an owner who runs `git init` later gets it on their next install.
- **pnpm and Docker are checked only when init installs.** With `--no-install`, init runs neither, so it checks neither. Go is checked either way, as before.
- **How pnpm is checked** (`requirePnpm` in `src/toolchain.ts`). init writes a `package.json` naming the install's `packageManager` into a temp folder and asks `pnpm --version` there. The install's version passes. Anything else stops init, with `corepack enable` where Corepack is on the PATH and `npm install -g pnpm` where it isn't. It asks rather than compares versions, so any pnpm that would switch passes.
- **Notes print last, just above the next steps:** the Docker warning, then the first commit's note. The wizard's command that skips the questions prints straight after the questions, before the install's output, so the next steps end the run.
- **What success prints:** `Made a robkit install in <dir>. Next:`, then `cd <folder>` and `pnpm dev`, then `Then open http://hub.robkit.localhost:3000 and claim the install.` The line about the guest code `test` is gone.
- **The first commit** is `Make a robkit install`, made with `--no-verify` after the install, so `pnpm-lock.yaml` is in it. init asks `git var GIT_AUTHOR_IDENT` and `GIT_COMMITTER_IDENT` first, which fail where a commit would for want of a name or email.
- **The icon message is the manifest's own:** `robkit.icon must be one emoji, such as "📝".` It names the manifest's field rather than `--icon`.
- **`init()` from code** installs by default too, takes `env`, and returns `{ notes }`. `InitResult` is exported.
- **Only an owner's template keeps bytes.** `readOwnTemplate` in `src/generate.ts` reads `robkit/templates/<stack>`. robkit's own templates are read as text, as before.
- **`writeApp`** (`src/write.ts`) builds in `.robkit/<slug>-<random>` and renames into `apps/<slug>`. It refuses an `apps/<slug>` that exists before the rename, since a rename replaces an empty folder on Linux.
- **The registry goes to pnpm in `installDependencies`** (`pnpmEnv` in `src/set-up.ts`), so `robkit add`'s install gets it too. The pnpm check doesn't pass it on: a pnpm that switches versions fetches pnpm itself.

**What I found about pnpm and `packageManager`:**

- pnpm's docs: 9.7.0 added `manage-package-manager-versions`, which switches to the `packageManager` version when set to `true` ([release notes](https://github.com/pnpm/pnpm/releases/tag/v9.7.0)). 10.0.0 turned it on by default: "`manage-package-manager-versions`: enabled by default" ([release notes](https://github.com/pnpm/pnpm/releases/tag/v10.0.0)). pnpm 11 replaced it with `pmOnFail`, default `download` ([settings](https://pnpm.io/settings/cli)). Corepack's pnpm always runs the version `packageManager` names.
- In WSL, against a folder naming `pnpm@11.28.9`: pnpm 9.6.0 and 9.15.9 printed their own versions and installed with themselves. pnpm 10.0.0 printed `11.28.9` and installed with it. Corepack printed `11.28.9`.
- So pnpm 10 or later and Corepack's pnpm pass. pnpm 9 stops, unless its owner turned the setting on. A pnpm 11 whose `pmOnFail` isn't `download` stops too.

**For the next tickets:**

- **18:** `add()` in `src/robkit-command.ts` calls `addApp`, which ends with the rename into `apps/` (`writeApp`), then `finishInstall` when the install has `node_modules`. Tell a running `pnpm dev` right after that, before the "Added apps/<slug>" lines.
- **19:** init makes no first commit when git is missing or has no name or email (`startGit` and `firstCommit` in `src/set-up.ts`), and `--no-install` makes no repository. The install's `README.md` has a `## Commands` block for `pnpm robkit upgrade`. `generate.test.ts` checks every `pnpm <script>` in the README is a script, and `robkit` is one.

**Proof**, in WSL (Ubuntu 22.04, Node 24) unless it says Windows:

- The full gate (`pnpm check:all`) passed every task but two, on three runs under a load average of 40 to 146 from other workers' tests. Each failure was a timeout, and each passed alone with retries off: dev's two SIGHUP tests (`runner.db.test.ts`), and the whole-stack test's role journey on every stack, whose `start.test.ts` passed 13 of 13 alone.
- The production test passed 27 of 27.
- create-robkit's tests passed 30 files of 30 in the gate. On Windows the touched tests pass, bar the four that need Go on the PATH.
- The coverage ratchet passed.
- The built bin under a real Node 22.23.4 printed `Node 22.23.4 is too old: robkit needs Node 24 or later. Install it from https://nodejs.org, then run npm create robkit again.`, exited 1 and wrote nothing.
- `create-robkit my-install --stack start --link` with a git identity ended with the next steps and left one commit, `Make a robkit install`. With no name or email, it printed the one-line note above the same next steps and exited 0.
- `pnpm robkit add notes --icon memo` printed `robkit.icon must be one emoji, such as "📝".` and wrote nothing.

### Merged

Added by the lead. PR 94 merged into `m3-making-an-install` on 2026-11-10 as `62f9f9b`, with `gate`, `check`, `pull-request` and `production` green on `3bb56ed`.

I added four commits to the branch before it merged:

- **A merge of the milestone branch**, which by then held ticket 14's release. Both tickets had added a line at the same place in the map, and the merge keeps both.
- **`CONTRIBUTING.md`'s check of a release** no longer runs `pnpm install` after `npm create robkit`.
- **The two tests of init's install use a fake pnpm**, ahead of the machine's own on `PATH`, beside the machine's real git (`pathAhead` in `src/test/path.ts`). They ran a real install from npm's registry with 110 seconds to finish. In the first CI run npm took 10 to 21 seconds a request, and neither finished. The registry test in `tooling/e2e` still makes an install and its first commit with the real pnpm, from `npm create robkit` alone, so the first criterion rests on both.
- **Three of init's tests read pnpm's version from the checkout** (`installsPnpm`), where they named 11.28.9.

The second CI run failed in the Next journey, for a cause that wasn't this ticket's: core restarted mid-journey when another install's `pnpm install` linked a file core imports. That is ticket 33. The same commit passed when the job ran again.

After the merge I made the six tests that named robkit's version as 0.0.0 read it from `package.json`, so the version pull request passes `gate`: five in create-robkit and the registry test in `tooling/e2e`. In a copy bumped to 0.1.0 with `changeset version`, create-robkit's 364 tests and the registry test's 11 passed.
