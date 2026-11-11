# 26: The site matches the release it describes

**What to build:** The site is written while milestone 4 of "Just use it" changes robkit beside it. Before `docs-site` merges to `main`, the site has to describe the code that will be released, with no known mismatch left.

- **Merge `main` into `docs-site`**, with milestone 4 in it.
- **Let the checks speak first.** The command reference, the settings reference, the package pages, the file-list tests and the imported template files fail or change by themselves where robkit moved. Fix each.
- **Then read what no check holds.** Run the script from ticket 03 over the files milestone 4 changed, and read each page it prints against the code. Each content ticket's comments list what milestone 4 would change on its pages: go through those lists.
- **Take the screenshots again** with ticket 08's command, since the hub changed.
- **No stub is left.**
- **Every page, in a browser.** Run axe over every built page, in light and dark, at 375 and 1280 pixels wide.
- **Record the commit** of `main` the site was read against, in this ticket's comments. The second council round reviews the site at the commit this ticket ends on.

**Blocked by:** 25; every ticket before this one, and milestone 4 of "Just use it" merged to `main`

**Status:** ready-for-agent

- [ ] `docs-site` holds `main` with milestone 4 merged, and CI's `gate` passes on it
- [ ] Each item in the content tickets' "what milestone 4 will change" lists is done or shown not to apply, and the Proof goes through them
- [ ] The screenshots were retaken, and their record names the new commit
- [ ] The stub count is zero, and a test fails on a stub from now on
- [ ] axe finds nothing on any page, in either theme, at either width
- [ ] The ticket's comments name the commit of `main` the site describes
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Done early, in the catch-up with milestone 4 (PR 131)

The branch `docs-14b-catch-up-with-main` merged `docs-site` at `7bc45f2a`, which holds `main` with milestone 4, into the stack up to ticket 14. It brought these up to milestone 4:

- **The checks spoke first.** The build and all site tests passed after the merge. No `<TemplateFile>` part broke, and the file lists for Start, React + Hono, React + Express and Next.js still matched. Ticket 15 lists Go's new `src/home.tsx` and `src/home.test.tsx`.
- **The guides' "make it yours" steps ran again**, for React + Hono, React + Express, TanStack Start and Next.js. Each ran in an app made from milestone 4's templates, with `pnpm dev`, the migration, typecheck, build, tests and lint. No fence needed a change. React + Go's guide, ticket 15, was written against milestone 4.
- **The layer rule page** has milestone 4's fifth rule and a section on what `robkit check` doesn't stop. That covers ticket 10's item on just-use-it ticket 23.
- **Start's test and Go's page test.** The Start guide and "Testing with a viewer" say that Start's test presses the card's button, and that a React + Go app's page has its own test.
- **The layer rule and `.d.ts` files.** Once just-use-it ticket 42's fix reached `docs-site`, ticket 19's branch gave the fifth rule the install `AGENTS.md`'s sentence, that a `.d.ts` file may import another from a folder `robkit check` doesn't read. The security page builds the ways past the lint from `SECURITY.md`, so it has "A `.d.ts` file with code in it" already. In WSL, in a Next install made from that branch, `pnpm lint` exited 0 after `pnpm dev`, whose `next-env.d.ts` imports from `./dist/dev/types`, and again after `pnpm build`. Neither the Next.js guide nor this ticket says lint fails there.
- **Ticket 16** was written after the catch-up. It describes removing an app and the socket in `~/.robkit/run` as milestone 4 made them.

### Left for this ticket

- **The screenshots.** The hub changed: the intro link's question, the launcher's "Try again" and its note when an app sends a viewer straight back. Run `pnpm screenshots` again and fix the words in `screenshots.ts` to match (ticket 08's item).
- **`next/image` and `public`.** Next's template `AGENTS.md` now has an "Images" section: `<Image>` can't optimize a file in `public`, since the guard refuses the optimizer. The Next.js guide and the line on built files in "The viewer and the guard" say nothing about it yet (tickets 09 and 14).
- **The rest of the content tickets' lists**, not checked in the catch-up: ticket 02's native Windows item (just-use-it ticket 21), ticket 06's home page items, and ticket 07's set-up form and `case "owner":` items. The build would have failed on a lost `case "owner":` line, and it didn't.
- **This ticket's own steps.** Ticket 03's script over the files milestone 4 changed, the stub count and its test, axe on every page, the commit of `main` the site describes, and `preRelease` once robkit is on npm.
