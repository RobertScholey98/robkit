# 29: The council's findings on the finished site

**What to build:** Two reviewers, Opus 5.5 and Sol 6.1, read the finished site at `8997ccb0` before `docs-site` merges to `main`. R capped the council at one round, so this ticket fixes what that round found and no second round follows. A finding is fixed when both reviewers raised it, or when one did and the lead confirmed it in the code. The rest go in the PR's not-taken list with a reason each.

- **Pages that say something the code doesn't do.** The quickstart's clone route on Node 26, which ships no Corepack. `cd my-install` from inside the clone. The Go module in a linked install. What `npm create robkit` prints and refuses. What `robkit deploy` does with a name Coolify lacks. Which stacks serve `public` files without the guard. How long a session lasts.
- **Pages that leave something out.** `--roles` beside `--access` in the five stack guides. The app's own test after the first change. What an upgrade changes, and how to undo one. Starting again with an empty database. `sessionFetch`'s 30-second limit. A page on the shared UI kit.
- **The site's own code.** The contents list at phone and desktop widths, the search box when its script fails to load, `/docs/` with no page, Copy buttons on output, and the browser test's open contexts.
- **Two exports published as exact lists of names.** `refusedAppSettings` and `robkitCommands`.

What the round found that needs R goes to tickets: just-use-it 63 and 64, and notes in docs tickets 27 and 28.

**Blocked by:** 26

**Status:** done

- [x] Each finding the lead took is fixed, and the PR's table names each one
- [x] Each finding not taken has a reason in the PR
- [x] The site's tests cover each fix that changes what a page's code block or a component does
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose

- **One round, as R ruled.** Sol 6.1 gave 8/10 and Opus 5.5 gave 7/10. Both said not to merge unchanged. PR 151 holds every finding in a table, with the file read for each and what was done.
- **Who did what.** The lead wrote the page-text fixes. Three Opus 5.5 workers each took one part in a checkout of their own: the site's code, the two exports, and the page on the UI kit. The lead read each diff against the code before bringing its commits to the branch.
- **Six findings not taken**, each from one reviewer. The PR's "Not taken" list gives the reason for each.
- **A finding of the lead's own.** A React + Go app wraps every handler in the guard, so its built files and `public` files are behind it. Three pages and `SECURITY.md` named Next.js as the only stack that differs.
- **One part left.** Inline code such as `--roles` can still wrap after its dashes on a phone. Astro's Markdown no longer runs rehype plugins, and the other way in needs a new dependency.
- **A faulty piece of evidence.** Both screenshots the reviewers got named `menu-open` showed the menu closed. The lead took them again, and the open menu draws as it should.

### Proof

- **Against the code.** The lead read the code for each finding before a page changed. PR 151's table names the file for each.
- **Tests that failed first.** The quickstart's test expects the clone route with no `corepack enable`, and `cd ../my-install` before the release. Each fix to the site's code has a test that failed before it. The exports' type tests failed `tsc` on the old source.
- **A real install.** The UI kit page's steps ran in an install made with `pnpm create-install`. `pnpm exec shadcn add switch` wrote the component, and the example app imported it and passed `tsc`.
- **In WSL (Ubuntu 22.04, Node 24)** on the branch's last commit before this note, the build makes 44 pages. The site's tests pass all 628, unit and browser, at 100% coverage. The repo checks pass all 396, `@robkit/dev`'s unit tests all 170 and create-robkit's all 540. The site's typecheck and lint, `pnpm knip` and `pnpm format:check` pass.

### For R

None of these blocks the merge to `main`.

- **Just-use-it ticket 63.** `robkit deploy` takes Coolify's only project, server or GitHub App whatever name `coolify.json` gives. The guide now says so. Should the code refuse a name Coolify doesn't have?
- **Just-use-it ticket 64.** robkit can't reset the owner's password. The pages now say so. What should an owner who lost it do?
- **Just-use-it ticket 65.** Two lines in the UI kit's `AGENTS.md` don't match what `shadcn add` did in a real install.
- **Docs ticket 27** notes that every link starts at `/`, so the host must serve the site at a domain's root.
- **Docs ticket 28** asks about the screenshots. The hub's launcher picture is mostly empty, and the sign-in and admin pictures are small on a wide screen.
- **The home diagram** says "sign-in, launcher" under the hub, shortened from "sign-in and launcher" so the words draw 12 pixels tall on a phone.
- **`/docs/` and each section's folder** now lead to their first page through a meta refresh. A host that can redirect could do it with a 301 instead, once ticket 27 names the host.
