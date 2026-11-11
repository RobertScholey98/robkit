# The robkit.dev docs site

**Status:** ready-for-agent

## Problem statement

R owns robkit.dev and nothing is there. Everything a newcomer can read about robkit is in the repo: a README, `SECURITY.md`, decision records, and the `README.md` and `AGENTS.md` files an install gets. Those were written for contributors and for coding agents. Ticket 20 of the "Just use it" work read every one against the code and listed what no doc covers:

- No page takes a person from nothing to a first app of their own. The stack `AGENTS.md` files cover it, for an agent.
- Nothing says in one place what robkit is for, who it suits, and what an install looks like once it runs.
- The commands, the settings and the packages have no reference a reader can search.

Create React App, TanStack Start and Ignite each have a site that answers "what is this, and how do I start" in a minute. R wants robkit to be as easy to just use as those (R, 2026-11-09), and a kit nobody can read about isn't.

## Solution

A static site at robkit.dev, built from a `site/` folder in this repo with Astro and MDX (R, 2026-11-09). It has a home page that says what robkit is and shows the three commands that start an install, and docs that take a reader from the quickstart, through building an app on each stack, to deploying and upgrading. The design is robkit's own, made with `/ui-ux-pro-max`, not a stock docs theme.

The docs change in the same pull request as the code. The repo's checks cover the site: every TypeScript example compiles against the built packages, every `robkit` command and `pnpm` script in a command block exists, every internal link resolves, and the glossary's words are used. A file a page shows from an install is read from the templates when the site builds, never pasted.

A separate thread builds it, and the lead of the "Just use it" work oversees that thread, reads each pull request and merges it.

## Stories

A newcomer is someone deciding whether to use robkit. An owner runs an install. A builder writes an app in one, and is often the owner.

1. As a newcomer, I want the home page to say in one sentence what robkit is, so that I know in ten seconds whether to read on.
2. As a newcomer, I want to see the three commands that make an install and start it, so that I can try it before I read anything else.
3. As a newcomer, I want to see what a running install looks like (the hub, the launcher, an app, admin), so that I know what I would get.
4. As a newcomer, I want to know what robkit needs on my machine (Node, pnpm, Docker, and WSL on Windows), so that I don't start something I can't finish.
5. As a newcomer, I want to know that nothing is on npm until the first release, so that I don't run a command that can't work yet.
6. As a newcomer, I want a plain account of who robkit suits and who it doesn't, so that I don't adopt it for the wrong job.
7. As a newcomer, I want to see which stacks an app can be built on, so that I know my own is there.
8. As an owner, I want a quickstart that ends with me signed in to the hub of my own install, so that I have something working in minutes.
9. As an owner, I want the quickstart to say what each command printed and what to do when it refuses, so that a missing Docker or a taken port doesn't stop me.
10. As an owner, I want to add an app while `pnpm dev` runs and see it in the launcher, so that I learn the loop I will repeat.
11. As an owner, I want to know how guests get in (access codes, roles, and who may open each app), so that I can share an app with someone.
12. As an owner, I want one page on the install's settings and each app's own `.env`, so that I know where a value goes.
13. As an owner, I want a deploy guide for the path robkit supports, with what to set up once, so that I can put my install on my own domain.
14. As an owner, I want to know how to upgrade an install and how to undo an upgrade, so that I can take fixes without fear.
15. As an owner, I want to know what robkit protects and what it leaves to me, so that I can decide whether to import an app I didn't write.
16. As a builder, I want a guide for my stack that shows a route, the viewer, a database table and a test, so that I can write my first feature.
17. As a builder, I want every code sample to be one I can paste, so that I don't debug the docs.
18. As a builder, I want to switch a sample between stacks where they differ, so that I read only my own.
19. As a builder, I want to know how the guard decides who may open my app, so that I can reason about a 404 or a redirect.
20. As a builder, I want to know how to change my app's tables and apply the migration without a restart, so that I keep my flow.
21. As a builder, I want to know how to test a route as an owner, a guest or nobody, so that my access rules have tests.
22. As a builder, I want to know what my app must not do (import another app, read the session cookie itself), so that `robkit check` doesn't surprise me.
23. As a builder, I want a reference of every `robkit` command with its options and what it prints, so that I don't read source to learn a flag.
24. As a builder, I want a reference of each package's exports, so that I can find `guarded()`, `appDatabase()` and `serve()` and their options.
25. As a reader, I want search that finds a page by a command, a setting or a word in its text, so that I don't have to know the site's layout.
26. As a reader, I want a sidebar that shows where I am and a list of the page's headings, so that I can move around a long page.
27. As a reader, I want next and previous links at the foot of each page, so that I can read the docs in order.
28. As a reader, I want a copy button on every command and code sample, so that I don't select text by hand.
29. As a reader, I want light and dark themes that follow my system and remember my choice, so that the site is comfortable at any hour.
30. As a reader on a phone, I want the navigation and code samples to work at 375 pixels wide, so that I can read on the move.
31. As a reader who uses a keyboard or a screen reader, I want every control reachable and named, visible focus, and text contrast of at least 4.5 to 1, so that I can use the whole site.
32. As a reader who prefers reduced motion, I want the site to honour that setting, so that nothing moves that I didn't ask for.
33. As a reader on a slow connection, I want a docs page to be HTML and CSS first, so that it is readable before any script loads.
34. As a reader, I want every page to have a link to its source on GitHub, so that I can fix a mistake I find.
35. As a reader, I want a glossary with robkit's words, so that "install", "owner", "guest" and "stack" mean one thing each.
36. As a reader who lands on a missing page, I want a 404 page with search and a way home, so that a stale link isn't a dead end.
37. As someone sharing a link, I want each page to have a title, a description and a preview image, so that the link reads well where I paste it.
38. As a contributor, I want the site to build with one command and no Docker, so that I can check a docs change quickly.
39. As a contributor, I want CI to fail on a broken link, an example that doesn't compile or a command that doesn't exist, so that the docs can't drift from the code without someone noticing.
40. As a contributor, I want the site's design written down as tokens and rules, so that a new page looks like the others without my guessing.
41. As a coding agent, I want each docs page reachable as plain Markdown and listed in an `llms.txt`, so that I can read the docs without scraping HTML.
42. As R, I want the site to be static files any host can serve, so that where it is hosted stays my choice.
43. As R, I want no analytics, no cookies and no third-party requests on the site, so that it asks nothing of its readers.
44. As R, I want to read the design and the home page before the site goes live, so that robkit.dev says what I mean it to.
45. As a newcomer, I want to know what hosting an install takes, and what robkit leaves me to write and run, so that I know the cost before I start.
46. As a newcomer, I want to know the licence and where to report a problem, so that I know what I can count on.
47. As a contributor who changed robkit, I want to see which pages describe a file I changed, so that I know what to read again.

## Implementation decisions

**Where it lives and what builds it**

- The site is a private package in the workspace, in `site/`, built with Astro to static files, with its pages in MDX (R, 2026-11-09). It is never published to npm and takes no changeset.
- No docs theme. R chose a design made with `/ui-ux-pro-max` over a stock theme, so the site doesn't use Starlight or a theme like it. It uses Astro's own pieces: content collections, MDX, the sitemap, and Shiki for code.
- Every version the site needs goes in the catalog, as an exact version, like every other package's. pnpm holds back a package published in the last day, so the builder pins an older version and adds no exemption.
- The builder doesn't change the version of a catalog entry the templates use. An install's catalog takes robkit's versions for those names, so raising one for the site would change every new install.
- The site joins both gates. `pnpm check` builds it and runs its lint, its typecheck and the tests that need no browser. `pnpm check:all`, which CI's `gate` runs, adds the browser tests. Neither needs Docker.
- The repo's own checks find the site: the package graph, the package-scripts check, the coverage thresholds, knip, the catalog check and Prettier. Today the first three look only under `packages/` and `tooling/`, so ticket 01 changes them.

**The design**

- The builder runs `/ui-ux-pro-max` first, for a developer tool's docs and home page, and saves what it gives as `site/DESIGN.md`. This plan calls that file the style guide, since `GLOSSARY.md` keeps the skill's own name for it to mean something else. It is the one source for the site's colours, type, spacing and motion. The site's CSS holds them as custom properties, and no component names a raw colour.
- Light and dark, both designed, both checked for contrast. The first paint follows the system setting with no flash, and a toggle remembers the reader's choice.
- The reference sites are create-react-app.dev, tanstack.com/start and infinite.red/ignite. The builder reads them for what a reader finds in the first minute, and copies no look from any of them.
- Fonts are served from the site itself. No request leaves the site's own origin.
- Icons are SVG. No emoji stands in for one.
- A docs page reads with no script at all. The theme toggle, the copy button, the stack switcher and the phone menu are small scripts of the site's own. Search may use a library, if the site serves it and it loads only when the reader opens search. Ticket 02 records a size limit for what a page fetches when it opens.
- R reads the style guide and the home page before the site goes live (story 44), and nothing is published until R has approved them. That doesn't hold up the pages: they are MDX, so a change to the design afterwards touches the tokens and the layout, not the words.

**The pages**

- **Home.** What robkit is, the three commands, what robkit gives an app and what stays the builder's, what an install holds, the five stacks, who it suits, what trying it and hosting it take, the licence, and where to report a problem.
- **Get started.** What you need, the quickstart to a signed-in hub, what you got, and a first app.
- **Build an app.** One guide per stack (TanStack Start, React + Hono, React + Express, Next.js, React + Go), and shared pages for the viewer and the guard, writes, testing with a viewer, the database and migrations, settings, and the layer rule.
- **Run an install.** `pnpm dev` and what its refusals mean, adding and removing apps, guests with access codes and roles, and upgrading.
- **Deploy.** The Coolify path the install's `docs/deploy.md` describes.
- **Concepts.** How a request and a token flow, what robkit protects and its known gaps, and the glossary.
- **Reference.** Every command, every setting, and the packages an app imports from.
- Contributing stays in the repo. The site links to `CONTRIBUTING.md` on GitHub.

**The words**

- Pages are written for a person, in the second person, and follow the repo's writing rules: the answer first, plain words, sentence-case headings, no em dashes.
- They use the glossary's terms, and the glossary check reads the site's pages as it reads `docs/`.
- Until 0.1.0 is on npm, every page that shows `npm create robkit` carries one line saying the packages aren't published yet, with the way to make an install from a checkout. One switch in the site's settings removes the line, and turns the quickstart round to lead with `npm create robkit`.
- A page says only what the code does. The builder reads the code or the test, not only the repo doc, before writing a claim. Ticket 20's comments list the best source for each subject.
- A page promises nothing the repo doesn't offer: no support, and no claim about how mature or how widely used robkit is.

**One source for each fact**

- A file a page shows from an install or an app is read from the templates when the site builds. A page never pastes one.
- The glossary page is built from `GLOSSARY.md`, and the known gaps from `SECURITY.md`'s own list.
- The command reference is checked against the `robkit` and `create-robkit` usage text: a command or option on the page that the command doesn't have, or the reverse, fails a test.
- The settings reference is checked against the names the code reads.
- The package reference is checked against each package's `api-report.md`, which the repo already checks against the built API. The Go module has no API report, so its page is checked against what `go doc` prints.
- A page can name the repo files it describes, and a script lists the pages that name a changed file (story 47). It fails nothing.

**Changes to robkit's code**

- The site changes nothing robkit does. A ticket may export a value robkit already has, such as the list of `robkit`'s commands or the names an app's `.env` can't set, so that a page can be held to it. Each export is a commit of its own, with a changeset and the package's API report.

**For agents**

- The build writes each docs page as Markdown beside its HTML, and an `llms.txt` that lists them (story 41). The Markdown is what a reader sees, not the page's source.

**Hosting**

- The build's output is a folder of static files. Where it is hosted, when it publishes, and robkit.dev's DNS are R's to choose and do. A ticket marked `needs-info` holds the questions with the options. Nothing in this work deploys the site.
- Until R chooses, CI builds the site on every pull request and keeps the built folder as an artifact of the run.

**One release, one site**

- Milestone 4 of "Just use it" changes robkit while the site is written. A page describes the code on the `docs-site` branch when it is written, and each content ticket lists in its comments what milestone 4 will change on its pages.
- The Deploy page waits for milestone 4's ticket 22, which rewrites what the page describes.
- The last build ticket merges `main` into `docs-site` with milestone 4 in it, brings the pages and the screenshots up to it, and leaves no known mismatch. The site merges to `main` after that.

**How the work runs**

- A builder thread, separate from the "Just use it" lead's, takes the tickets in order: one branch and one pull request per ticket, each against the `docs-site` branch, built with `/tdd` where a ticket has behaviour to test and with `/ui-ux-pro-max` wherever it changes what a reader sees.
- The lead reads each pull request and merges it once CI's `gate` passes.
- The council's two rounds apply as they do to a milestone: one on the tickets before the build starts, and one on the finished site before `docs-site` merges to `main`. The second round reads the site in a browser as well as the code.

## Testing decisions

A good test here asks what a reader or a contributor would see: a page that builds, a link that resolves, an example that compiles, a control that works from the keyboard. It doesn't assert a component's markup.

- **Examples compile.** The repo's doc-examples check gains the site's pages, so every `ts` and `tsx` fence compiles against the built packages, and `nocheck` marks a deliberate fragment. Prior art: `doc-examples.test.ts`.
- **Words.** The glossary check gains the site's pages. Prior art: `glossary.test.ts`.
- **Commands exist.** A test reads each `sh` fence and fails on a `robkit` command or a `pnpm` script that doesn't exist. Prior art: the README test in create-robkit's `generate.test.ts`, which checks every `pnpm` command an install's README names.
- **The references.** A test for each reference page fails where the page and the code differ, both ways: the usage text, the settings the code reads, and each package's exports.
- **Go.** A test runs `gofmt -l` on each `go` fence.
- **Links.** A test over the built site fails on an internal link, an anchor or a local image that leads nowhere.
- **The navigation.** The function that turns the pages' front matter into the sidebar, the order and the next and previous links is plain data in and out, and has unit tests.
- **Stubs.** A page not written yet is marked as a stub, and a test counts them. The last build ticket makes any stub a failure.
- **Accessibility and behaviour.** Playwright opens the built site and runs axe in light and dark, at phone and desktop widths. It also drives the theme toggle, the stack switcher, the copy button, the phone menu and search from the keyboard. The last build ticket runs axe over every page. Prior art: the whole-stack journeys, which already run axe with `@axe-core/playwright`.
- **No script, no problem.** One test loads a docs page with scripts off and checks the text and the navigation are there.
- **Weight.** A test fails when the scripts a docs page fetches as it opens pass the size ticket 02 records.

## Out of scope

- Hosting, DNS and the deploy to robkit.dev. They wait for R.
- Docs for more than one robkit version. There is one version, the next release.
- Translations, a blog, a showcase and a changelog page.
- The deployment cookbook for hosts other than Coolify, and pages on backups, observability and secret rotation. The map lists all of them as not yet specified.
- Native Windows. The docs say to use WSL, and ticket 21 of "Just use it" waits for R.
- Analytics and any third-party script.
- A dark theme for the hub and admin. Their screenshots are light, as an install is today.
- Changing what robkit does. Where a page can't be written because the code is wrong or unclear, the builder opens a `needs-triage` ticket and writes around it.

## Further notes

- Ticket 20's comments, under "For the docs site's builder", give the best source for each subject and the gaps no doc covers. Start there.
- robkit isn't on npm. Every command the site shows is tested from a local registry in the repo's own tests, and works for a reader only after R's first release.
- The install's own `README.md` and `AGENTS.md` stay as they are. The site is for people who haven't made an install yet, or who want the long form.

## The ticket round, 2026-11-11

Two reviewers read the first 19 tickets at `963c38be`, alone and without editing. Opus 5.5 gave them 6 out of 10 and Sol 6.1 gave them 7. Both said to fix their must-changes before the build started. The lead checked each claim against the code, rewrote the tickets once into the 28 here, and ran no second round.

**Taken, raised by both**

- The package graph, package-scripts and coverage checks would have passed without reading `site/`. Ticket 01 makes each find it.
- The doc-examples and glossary checks read only `.md` files, and turbo wouldn't rerun them for a page. Ticket 04 fixes both, before any page with code is written.
- The home page linked to guides that didn't exist yet. Ticket 03 adds marked stubs, and ticket 26 fails on any left.
- The Deploy page described a command milestone 4 rewrites. Ticket 25 waits for it.
- Nothing checked that a command on a page exists. Ticket 04 adds the test.
- Comparing a count of known gaps proves little. Ticket 19 builds the list from `SECURITY.md`.
- The settings reference covered only names that start `ROBKIT_`. Ticket 21 covers the rest.
- "Packages an owner never imports" was wrong: the hub and admin import two of them. The Go module has no API report. Ticket 22 handles both.
- A page's MDX source isn't Markdown a reader can use. Ticket 24 says what the Markdown must hold, and uses one preview image for the site.
- The hosting ticket would have turned into a deploy. Ticket 27 only records R's answers, and asks when the site publishes as well as where.
- R's read had no bearing on publishing. Ticket 28 makes approval a condition of it, and asks four questions with what was built as each default.
- The site would have described two versions of robkit at once. Ticket 26 brings it to one before it merges.

**Taken, raised by one and confirmed in the code**

- `pnpm check` wouldn't have built the site, since turbo's `test:unit` depends only on other packages' builds (Opus). Ticket 01.
- The usage text and the names an app's `.env` can't set are private, so the references couldn't be held to them without an export (Opus). The PRD now allows one.
- The skill's name for the style guide is a phrase the glossary avoids (Opus).
- Astro wants a newer Vite than the catalog pins, and the catalog's version reaches every install (Opus). Ticket 01.
- `tsx` samples had nothing to compile against in `tooling/repo-checks` (Opus). Ticket 04.
- The stacks don't share one way to test with a viewer (Sol). Ticket 09 shows each stack's own, from its template's test file.
- A removed app stays in the launcher today (Sol). Ticket 16 says so.
- The hub has no dark theme, so a dark screenshot would show something an install doesn't do (Opus). Ticket 08.
- Four tickets were too large to review as one pull request each (both, in different places). The checks split from the code blocks, the shared pages into two, the guides into one per stack, and "Run an install" into three.

**Not taken**

- **Compile a guide's fences together, as one app (Sol).** It needs a new checker that builds groups of fences inside a generated app. The guides show the templates' own files instead, so the code on the page is the code `robkit add` writes. The builder's own fences each compile alone or carry `nocheck` with a reason.
- **Fail the gate when a file a page describes changes (Sol, as one of two ways).** It would stop every pull request that touches such a file. Ticket 03 has the lighter way: a script that lists the pages to read again.
- **Leave the samples page out of the published site (Opus).** The browser tests read the build that is published. A second build without the page would mean publishing a site no test opened. The page is `noindex` and out of the navigation, the sitemap, search and `llms.txt`.
- **Reach the usage text by running `robkit` with an unknown command (Opus, as one of two ways).** The export is simpler to hold a test to.
- **Hold the screenshots until milestone 4's hub changes land (both).** They are taken now, so the home page and the quickstart can be read, and taken again in ticket 26.

## The code round, 2026-11-11

The same two reviewers read the finished site at `8997ccb0`, alone and without editing, with the built site and 137 screenshots. Sol 6.1 gave it 8 out of 10 and Opus 5.5 gave it 7. Both said not to merge unchanged. R capped the council at one round, so no second round followed.

[Ticket 29](issues/29-the-councils-findings.md) fixed what the round found, in pull request 151. Its description holds every finding in a table, with the file the lead read for each. Of 39 findings, 33 were fixed and 6 weren't taken.

`docs-site` merged to `main` on 2026-11-11 as `43221e7c`, in pull request 152. Nothing is published. Tickets 27 and 28 wait for R.

**Not taken**, each raised by one reviewer

- **Move the quickstart's "if it fails" notes below the steps (Sol).** They sit at the step that fails, where a stuck reader looks.
- **Retake the screenshots cropped closer (Opus).** It needs new pictures. Ticket 28 now asks R.
- **Rank search results (Opus).** The right page is on the first screen of results.
- **Run the glossary check over the components' prose (Opus).** The components hold a few fixed sentences, read in review.
- **Upload the built site before the coverage step (Opus).** A failed run's site shouldn't pass for the branch's site.
- **Show a rejected promise in the Start guide's form (Sol, as a note).** The guide's example stays short, and the template's own card shows how.

One part of a finding that was taken isn't fixed. Inline code such as `--roles` can still wrap after its dashes on a phone.
