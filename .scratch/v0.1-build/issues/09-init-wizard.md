# 09: The init wizard

**What to build:** `npm create robkit` with no flags asks the init questions from the CLI flow prototype: project folder, package manager, ORM, the shared UI kit (y/n, then which), which generators `robkit add` offers, dev tools, and install plus git. Options that later tickets add show as disabled until they land. It ends with next steps and the equivalent non-interactive command.

**Blocked by:** 08

**Status:** done

- [x] init never asks for a domain or the owner's login; the owner claims the install on first run (ticket 03)
- [x] The wizard's answers and the matching flags produce the same install, byte for byte
- [x] The printed non-interactive command reproduces the run

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 10 onwards. R hasn't reviewed the choices marked "chosen in the build" yet.

- **When init asks (chosen in the build).** init asks its questions when no choice flag is given. `--link` doesn't count, so `pnpm create-install` runs the wizard from a checkout. A folder given on the command line skips the folder question. There's no `--yes`: any choice flag skips the questions, and a flag left out takes its default.
- **Prompts.** `@clack/prompts`, which draws the prototype's look and can disable an option. The test drives the real command over stdin, so it covers what a user types.
- **Options that come later (chosen in the build).** `wizard.ts` offers each choice's ready options from `choices.ts`, then lists its later ones as "coming later". When ticket 18 adds bun to `packageManagers`, the wizard offers it with no wizard change. `--pm bun` keeps failing until then.
- **The UI kit question (chosen in the build).** It's a select of No and Yes, with Yes disabled, because a yes/no prompt can't disable an answer. Ticket 15 enables Yes and adds "Which UI kit?" after it, as in the prototype.
- **Question order.** The ticket's: generators before dev tools. The prototype asked dev tools first.
- **Install and git (chosen in the build).** One question, "Install dependencies and initialise git?", defaulting to Yes. On flags it's opt-in as `--install`, so a scripted run still writes files only, as in ticket 08. The prototype had `--no-install`. It runs `pnpm install --no-frozen-lockfile`, since pnpm on CI refuses an install with no lockfile, then `git init`. There's no first commit, and init doesn't check whether the folder is inside another repository. Ticket 18 adds each package manager's install to the table in `set-up.ts`.
- **`--tools none`.** Unticking every dev tool prints `--tools none`, which writes an install without ESLint and Prettier.
- **The printed command.** `npm create robkit@latest <folder> -- --pm … --orm … --generators … --tools …`, plus `--install` and `--link` when used. A folder with a space is quoted. Ticket 15 adds `--ui`.
- **CI.** The whole-stack test now installs through `installDependencies`, so CI runs init's install step on a real install.
