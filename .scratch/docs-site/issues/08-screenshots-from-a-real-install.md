# 08: Screenshots taken from a real install

**What to build:** A script that starts an install made from this checkout, signs in as its owner, and takes the screenshots the site uses: the hub's sign-in, the launcher with a few apps, an app, and admin's access codes and roles. The home page and the quickstart show them.

- **Light only.** The hub and admin have no dark theme: the install's `theme.css` defines one, and nothing applies it. A dark screenshot would show something an install doesn't do. On the site's dark theme the screenshots sit in a frame that makes that plain.
- **The same every time.** The script makes its own apps, codes and roles with fixed names, so two runs give the same pictures. No secret is in a picture: the access codes shown are made for the picture and die with the install.
- **Files in the site.** The screenshots are committed, taken by a command a contributor runs. The gate doesn't retake them, since they need Docker. Beside them a small file records the commit and the command that made them.
- **Reuse.** The whole-stack tests already make an install, start it and sign in. Use their helpers where the package graph allows, and add the edge it needs.

The hub changes in milestone 4 of "Just use it" (its ticket 27). Ticket 26 runs this script again after that.

**Blocked by:** 06, 07

**Status:** done

- [x] One command makes every screenshot from an install it starts and stops itself, and `CONTRIBUTING.md` names it
- [x] Two runs of the command give the same pictures
- [x] The record beside the screenshots names the commit and the command
- [x] Each screenshot on the site has a text alternative that says what it shows
- [x] The home page stays under the script size ticket 02 recorded, and its images don't shift the layout as they load
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- `pnpm screenshots`, from the repo's root, runs `tooling/e2e/src/screenshots.ts`. It makes an install from this checkout with the whole-stack tests' `createInstall`, starts `pnpm dev` on port 3000 as an owner would, claims the hub as `robin`, and takes seven pictures into `site/src/screenshots`. Then it stops `pnpm dev`, removes the install's Postgres and folder, and writes `record.json`. It needs Docker and Linux, as the whole-stack tests do.
- Port 3000, not the tests' random ports, so every address in a picture is the one a reader sees.
- Everything in the pictures is fixed: apps notes 📝, recipes 🍲 and photos 📷 added with `robkit add`; guests Grandma `MAPLE7`, Sam `HARBOR3` and Alex `LANTERN9`; roles Family and Friends. The owner's id changes with each install, so the app's picture covers it.
- The pictures: the hub's set-up form, its launcher with only the example (taken before the other apps are added, for the quickstart), its launcher with four apps, a guest's sign-in, the example app, and admin's access codes and roles.
- The hub and the app are shot at 800 by 500, so their cards fill the picture and read at the column's width. Admin is shot at 1024 wide, for its table, and each of its sections with a 16 px margin. All at twice the pixels.
- `record.json` holds the commit and the command. A run from a tree with changes outside `site/src/screenshots` says so after the commit, and a test fails on that.
- `Screenshot.astro` shows a picture in a window frame: a bar with three dots and the address, on `--color-raised`. Its `alt` comes from `screenshots.ts`, and its `width` and `height` from the file, at half its pixels. Below the first screen it loads lazily. On the dark theme the frame shows a light page in a dark window. `DESIGN.md` has a Screenshots section.
- The home page has a new section, "What you and your guests see": the launcher, then a guest's sign-in beside admin's codes. The quickstart shows the set-up form, the first launcher and admin's codes. "Your first app" shows the example app.

**Proof.**

- In WSL, `pnpm screenshots` ran twice from a fresh clone of e3f0c06a. The two runs' PNGs had the same sha256, and both records named `e3f0c06ae0af3cfcc6e20e48d2fd59a88dbb1454` with no changes. The committed pictures are the second run's.
- I looked at each picture, and at the home page and the quickstart with them, at 1280 px light and dark, and at 375 px.
- `screenshots.test.ts` holds the PNGs to the names in `screenshots.ts`, each with words of more than 40 characters, and the record to a whole commit and the command.
- `built-site.test.ts`: every `<img>` on the built site has words of 20 characters or more, and a numeric `width` and `height`, so its space is kept before it loads.
- `weight.test.ts` passes: the home page's scripts are unchanged. Pictures aren't scripts.
- On Windows, the site's build, lint, typecheck, all 160 tests with 100% coverage, axe on the home page and the get started pages, `pnpm knip` and Prettier pass. The repo's glossary check passes.

**For the next tickets.**

- `<Screenshot name="..." />`, with a name from `screenshots.ts`, puts a picture on a page. Add `eager` for one on the first screen.
- To add a picture, add a shot to `takeScreenshots` in `tooling/e2e/src/screenshots.ts` and an entry to `screenshots.ts`, then run `pnpm screenshots` in WSL. The test fails until both agree.
- Ticket 17 can use `admin-roles`, which no page shows yet.
- Under load, an app that `robkit add` has just started can be slow to answer. The command gives a page two minutes.

**What milestone 4 will change on these pages.**

- Its ticket 27 changes the hub. Ticket 26 runs `pnpm screenshots` again then, and fixes the words in `screenshots.ts` to match.

### Merged

Added by the lead. PR 120 merged into `docs-site` on 2026-11-11 as `09d18442`, with `gate` green on `2f20b9a`. It went in with the catch-up, PR 131, whose `gate` passed on `e2e773e` for the whole stack on milestone 4's templates.
