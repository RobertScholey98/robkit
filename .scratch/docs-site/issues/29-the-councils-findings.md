# 29: The council's findings on the finished site

**What to build:** Two reviewers, Opus 5.5 and Sol 6.1, read the finished site at `8997ccb0` before `docs-site` merges to `main`. R capped the council at one round, so this ticket fixes what that round found and no second round follows. A finding is fixed when both reviewers raised it, or when one did and the lead confirmed it in the code. The rest go in the PR's not-taken list with a reason each.

- **Pages that say something the code doesn't do.** The quickstart's clone route on Node 26, which ships no Corepack. `cd my-install` from inside the clone. The Go module in a linked install. What `npm create robkit` prints and refuses. What `robkit deploy` does with a name Coolify lacks. Which stacks serve `public` files without the guard. How long a session lasts.
- **Pages that leave something out.** `--roles` beside `--access` in the five stack guides. The app's own test after the first change. What an upgrade changes, and how to undo one. Starting again with an empty database. `sessionFetch`'s 30-second limit. A page on the shared UI kit.
- **The site's own code.** The contents list at phone and desktop widths, the search box when its script fails to load, `/docs/` with no page, Copy buttons on output, and the browser test's open contexts.
- **Two exports whose types were wider than their use.** `refusedAppSettings` and `robkitCommands`.

What the round found that needs R goes to tickets: just-use-it 63 and 64, and notes in docs tickets 27 and 28.

**Blocked by:** 26

**Status:** ready-for-agent

- [ ] Each finding the lead took is fixed, and the PR's table names each one
- [ ] Each finding not taken has a reason in the PR
- [ ] The site's tests cover each fix that changes what a page's code block or a component does
- [ ] `docs-site` holds the fixes, and CI's `gate` passes on it
