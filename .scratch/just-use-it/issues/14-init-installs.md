# 14: `npm create robkit` installs and says what's next

**What to build:** After `npm create robkit my-install` today, the owner has a folder and has to know to run `pnpm install` and `git init` before anything works. Next.js and Create React App finish the job and print the next command. init should too, and its failures should say how to carry on.

- **init installs.** `npm create robkit` installs dependencies and makes the first commit unless told `--no-install`. This reverses app-sharing ticket 01's `--install` flag; record that in the map. The checkout's `pnpm create-install` keeps working.
- **It checks what it needs first.** Before writing anything it checks Node is 24 or later and that pnpm can run, and says how to get each (`corepack enable` for pnpm). A missing Docker is a warning, since only `pnpm dev` needs it. A Go stack still needs Go, as today.
- **It says what's next.** On success it prints the folder, then `cd <folder>` and `pnpm dev`, and the hub's address to open first. Nothing else.
- **A failed install can be finished.** When `pnpm install` fails, init says the files are written and to run `pnpm install` in the folder, and doesn't say "try again", which would hit "isn't empty". `robkit add` writes the app's folder in one move, so an interrupted add leaves nothing half-written, and says the same when its install fails.
- **`robkit add` refuses an icon the manifest would.** `--icon` and the wizard's icon question use `readAppManifest`'s own rule, so `robkit add notes --icon memo` fails at once and not at the next `pnpm dev`.
- **Template overrides keep their bytes.** A file in an install's `robkit/templates/<stack>` that isn't UTF-8 text, such as an image, is copied as it is.
- **The wizard.** With no arguments init still asks for the folder and the example's stack, and prints the command that skips the questions.
- **Docs.** The repo's `README.md` quickstart and create-robkit's README. The quickstart says `npm create robkit` and keeps the from-a-clone path for contributors.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] `create-robkit my-install` with no flags writes, installs and commits, and prints the next commands and the hub's address
- [ ] `--no-install` writes only, and prints the install command first
- [ ] On Node 22, or with no pnpm, init stops before writing and says how to fix it
- [ ] A failing `pnpm install` leaves a message that names the folder and the command to finish with
- [ ] `robkit add notes --icon memo` fails with the manifest's message and writes nothing
- [ ] An image in a template override arrives byte for byte
- [ ] The README's quickstart is the three commands
- [ ] The PR's CI `gate` job passes on GitHub
