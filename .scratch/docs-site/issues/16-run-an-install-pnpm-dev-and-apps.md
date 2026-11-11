# 16: Run an install: `pnpm dev` and your apps

**What to build:** The pages an owner comes back to about the running install.

- **`pnpm dev`.** What it starts, the addresses it prints, its settings in the root `.env`, and each thing it checks before it starts with what to do about it.
- **Adding an app.** `robkit add` with and without a running `pnpm dev`, and its options.
- **Removing an app.** Delete its folder and restart `pnpm dev`. Say what the code does today: core never takes an app out of its catalog, so a removed app stays in the launcher and in admin, and its schema and data stay in Postgres. Milestone 4 changes that (ticket 24 of "Just use it"), and ticket 26 brings this page up to it.

Milestone 4 also changes how the commands find a running `pnpm dev` from another terminal (ticket 34). Write what the code does on this branch, and list in the comments what tickets 24 and 34 will change here.

**Blocked by:** 03, 05

**Status:** done

- [x] Each check and refusal the `pnpm dev` page names is one the code makes, with the code's own fix
- [x] The removal steps were followed in an install made from this checkout, and the page says what the launcher and Postgres show afterwards
- [x] Every option of `robkit add` on the page is one the command takes
- [x] The comments list what tickets 24 and 34 of "Just use it" will change on these pages
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- One page, `run-an-install/pnpm-dev-and-your-apps`, with these headings: What it starts / Its settings / When pnpm dev stops at the start (with Its socket) / Add an app (With pnpm dev running, With no pnpm dev running, Your own template, Apply a new migration) / Remove an app.
- Milestone 4 is merged, so the page describes removal and the socket as the code does now, not as they were when the ticket was written:
  - Core takes an app whose folder is gone out of its catalog as it starts, so it leaves the launcher and admin. Its schema and role stay, and the page gives the command from the install's `AGENTS.md` that drops both.
  - The socket is in `~/.robkit/run`, for every terminal.
- The checks list follows `runDev` and `checkBeforeStart`, in the order they run. It also covers the socket folder checks from `requests.ts`. The quickstart's shorter list stays as it is and covers the first run.
- The `robkit add` options are a list, each with what it sets and its default. So are the settings. As tables they made the page 437 pixels wide on a 375-pixel phone, and `site/DESIGN.md` has no table style yet. The page links to "Your first app" for the questions rather than repeating them.
- "Your own template" covers `robkit/templates/<stack>`, which `add.ts` uses in place of robkit's template.
- `ROBKIT_DATABASE_URL` is left off the settings list. Ticket 21's settings reference is the place for it.

**Proof**

- A new built-site test runs `robkit add notes --nope` and reads the usage the command prints. It holds the page's option names to the usage's flags, the defaults to what the usage says, and the stack list to `readyStacks`. It also checks the page isn't a stub. I wrote it after the page, so I saw it fail only from a mistake in the test itself, not on the page.
- In WSL, in an install made with `pnpm create-install --stack react-hono` from this branch, with Postgres on port 25437:
  - `pnpm dev` printed the four "is ready at" lines the page shows, in that order, both times it started.
  - Refusals, each as the page says:
    - With `ROBKIT_DOMAIN=example.com`, `pnpm dev` refused with the "isn't local" message.
    - With a folder `apps/My-App` that has a `package.json`, it refused with the slug message. The folder without a `package.json` was skipped.
    - A second `pnpm dev` while the first ran refused with the port 3000 message.
    - With port 25437 held by another process, it refused with the Postgres port message.
    - `robkit migrate` with no `pnpm dev` printed "No pnpm dev is running in this install".
  - Adding and removing an app:
    - `robkit add notes` while `pnpm dev` ran printed the page's "Added apps/notes. pnpm dev started notes at ..." line. The launcher showed 📝 notes, admin listed notes, and Postgres had the schema `notes`, the role `notes` and its tables.
    - I stopped `pnpm dev`, deleted `apps/notes` and started it again. The launcher showed only the example, and admin no longer listed notes. Postgres still had the schema, the role and both tables.
    - The page's `drop owned by notes; drop role notes;` command dropped both.
    - `robkit add photos --stack go` with no `pnpm dev` printed the page's "Added apps/photos. Next:" block.
- A new `run-an-install.browser.test.ts` runs axe on the page at 375 and 1280 pixels in both themes, and checks it doesn't scroll sideways at 375 pixels. It failed at 437 pixels with the tables, and passes with the lists.
- The site's build, lint, typecheck and all 237 tests pass at 100% coverage. Of the repo checks, all but the six gofmt tests pass on Windows, which has no Go. This page has no Go fences.

**What the next tickets need**

- `built-site.test.ts` has an `itemsAfter(html, heading)` helper inside this page's `describe` that reads the items of the first list after a heading's id. Move it out if another page's test needs it.
- The site has no table style. A page that needs a table needs one in `site/DESIGN.md` first, or it scrolls sideways on a phone.
- Add each new Run an install page to `run-an-install.browser.test.ts`.
- `run16.sh` and `run16-drive.mjs` in the scratchpad drive the hub and admin as the owner from WSL. Ticket 17 can reuse them for guests and access codes.

**What milestone 4 changed**

Milestone 4 has merged. Tickets 24 and 34 of "Just use it" are in, and the page describes both: removal takes an app out of core's catalog, and the socket is in `~/.robkit/run`. Ticket 26 has nothing left to change on this page.

### Merged

Added by the lead. PR 133 merged into `docs-site` on 2026-11-11 as `6ecba785`. Its own `gate` failed on `c4b207c` from three create-robkit tests that passed their 30 seconds on a slow runner, which just-use-it ticket 60 fixes on `main`. The box is ticked on PR 136's `gate`, which passed on `3b5c9ff`. PR 136 is stacked on this one and holds its commits, and the tree merged into `docs-site` equals PR 136's head.
