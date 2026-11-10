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

**Status:** ready-for-agent

- [ ] `create-robkit my-install` with no flags writes, installs and commits, and prints the next commands and the hub's address
- [ ] `--no-install` writes only, and prints the install command first
- [ ] On Node 22, with no pnpm, or with a pnpm too old for the install's `packageManager`, init stops before writing and says how to fix it
- [ ] The entry file has no static import, with a test that reads it, and the Proof shows the message from a real Node 22
- [ ] With no git identity, and with no git, init finishes, skips the commit and says so
- [ ] A failing `pnpm install` leaves a message that names the folder and the command to finish with
- [ ] An add whose write fails partway leaves nothing under `apps/`
- [ ] A new install has a `README.md`, and the generator's tests check its commands exist in `package.json`
- [ ] `robkit add notes --icon memo` fails with the manifest's message and writes nothing
- [ ] An image in a template override arrives byte for byte
- [ ] The repo README's quickstart is the three commands
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Neither had a must-change here. I checked each point against the code and took these:

- **This ticket now waits for 16 too** (Sol). Both change `packages/create-robkit/src/robkit-command.ts`: 16 for a run outside an install and for `turbo ls`, this one for init and add.
- **The entry file can have no static import** (Opus). The ticket said the check runs before the file imports anything, which a static import makes impossible.
- **The pnpm on the machine may not be the install's** (both). The install's `packageManager` names one version. Find out which pnpm versions switch to it by themselves, and stop on one that doesn't.
- **A missing git has its own criterion** (Sol), and any other failed commit is the same one-line note (Opus).
- **An add is staged outside `apps/`** (both). `writeInstall` in `write.ts` writes file by file, so "one move" needed a place to build the folder first.
