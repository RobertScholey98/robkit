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

The docs change in the same pull request as the code. The repo's checks cover the site: every TypeScript example compiles against the built packages, every command a page names exists, every internal link resolves, and the glossary's words are used.

A separate thread builds it, and the lead of the "Just use it" work oversees that thread, reads each pull request and merges it.

## Stories

A newcomer is someone deciding whether to use robkit. An owner runs an install. A builder writes an app in one, and is often the owner.

1. As a newcomer, I want the home page to say in one sentence what robkit is, so that I know in ten seconds whether to read on.
2. As a newcomer, I want to see the three commands that make an install and start it, so that I can try it before I read anything else.
3. As a newcomer, I want to see what a running install looks like (the hub, the launcher, an app, admin), so that I know what I would get.
4. As a newcomer, I want to know what robkit needs on my machine (Node 24, pnpm, Docker, and WSL on Windows), so that I don't start something I can't finish.
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

## Implementation decisions

**Where it lives and what builds it**

- The site is a private package in the workspace, in `site/`, built with Astro to static files, with its pages in MDX (R, 2026-11-09). It is never published to npm and takes no changeset.
- No docs theme. R chose a design made with `/ui-ux-pro-max` over a stock theme, so the site doesn't use Starlight or a theme like it. It uses Astro's own pieces: content collections, the MDX and sitemap integrations, and Shiki for code.
- Every version the site needs goes in the catalog, as an exact version, like every other package's. pnpm holds back a package published in the last day, so the builder pins an older version and adds no exemption.
- The site joins the gate. Its build, typecheck, lint and tests run under `pnpm check`, with no Docker.

**The design**

- The builder runs `/ui-ux-pro-max` first, for a design system for a developer tool's docs, and saves it in the site's folder. That file is the one source for the site's colours, type, spacing and motion. The site's CSS holds them as custom properties, and no component names a raw colour.
- Light and dark, both designed, both checked for contrast. The first paint follows the system setting with no flash, and a toggle remembers the reader's choice.
- The reference sites are create-react-app.dev, tanstack.com/start and infinite.red/ignite. The builder reads them for what a reader finds in the first minute, and copies no look from any of them.
- Fonts are served from the site itself. No request leaves the site's own origin.
- Icons are SVG. No emoji stands in for one.
- A docs page ships no client-side library. The theme toggle, the copy button, the stack switcher, the mobile menu and search are small scripts of the site's own, and the page reads without them.
- R reads the design system and the home page before the site goes live (story 44). That doesn't hold up the pages: they are MDX, so a change to the design afterwards touches the tokens and the layout, not the words.

**The pages**

- **Home.** What robkit is, the three commands, what an install holds, the five stacks, and a way into the docs.
- **Get started.** What you need, the quickstart to a signed-in hub, and adding a first app.
- **Build an app.** One guide per stack (TanStack Start, React + Hono, React + Express, Next.js, React + Go), and shared pages for the viewer and the guard, the database and migrations, settings, and testing a route as a viewer.
- **Run an install.** `pnpm dev` and what its refusals mean, adding and removing apps, access codes and roles, and upgrading.
- **Deploy.** The Coolify path the install's `docs/deploy.md` describes.
- **Concepts.** How a request and a token flow, what robkit protects and its known gaps, and the glossary.
- **Reference.** Every command, every setting, and each package's exports.
- Contributing stays in the repo. The site links to `CONTRIBUTING.md` on GitHub.

**The words**

- Pages are written for a person, in the second person, and follow the repo's writing rules: the answer first, plain words, sentence-case headings, no em dashes.
- They use the glossary's terms, and the glossary check reads the site as it reads `docs/`.
- Until 0.1.0 is on npm, every page that shows `npm create robkit` carries one line saying the packages aren't published yet, with the way to make an install from a checkout. One switch in the site's settings removes it.
- A page says only what the code does. The builder reads the code or the test, not only the repo doc, before writing a claim. Ticket 20's comments list the best source for each subject.

**One source for each fact**

- The glossary page is built from `GLOSSARY.md`, not copied from it.
- The command reference is checked against the `robkit` and `create-robkit` usage text: a command or option on the page that the command doesn't have, or the reverse, fails a test.
- The settings reference is checked against the names the dev runner and the adapters read.
- The package reference links each package's exports to its `api-report.md`, which the repo already checks against the built API.

**For agents**

- The build writes each docs page as Markdown beside its HTML, and an `llms.txt` that lists them (story 41).

**Hosting**

- The build's output is a folder of static files. Where it is hosted, and robkit.dev's DNS, are R's to choose and do. A ticket marked `needs-info` holds the question with the options. Nothing in this work deploys the site.
- Until R chooses, CI builds the site on every pull request and keeps the built folder as an artifact of the run.

**How the work runs**

- A builder thread, separate from the "Just use it" lead's, takes the tickets in order: one branch and one pull request per ticket, each against the `docs-site` branch, built with `/tdd` where a ticket has behaviour to test and with `/ui-ux-pro-max` wherever it changes what a reader sees.
- The lead reads each pull request and merges it once CI's `gate` passes.
- The council's two rounds apply as they do to a milestone: one on the tickets before the build starts, and one on the finished site before `docs-site` merges to `main`. The second round reads the site in a browser as well as the code.

## Testing decisions

A good test here asks what a reader or a contributor would see: a page that builds, a link that resolves, an example that compiles, a control that works from the keyboard. It doesn't assert a component's markup.

- **Examples compile.** The repo's doc-examples check gains the site's pages, so every `ts` and `tsx` fence compiles against the built packages, and `nocheck` marks a deliberate fragment. Prior art: `doc-examples.test.ts`.
- **Words.** The glossary check gains the site's pages. Prior art: `glossary.test.ts`.
- **Commands and settings.** A test reads the reference pages and the commands' own usage text and fails where they differ. Prior art: the README test in create-robkit's `generate.test.ts`, which checks every `pnpm` command an install's README names.
- **Links.** A test over the built site fails on an internal link or anchor that leads nowhere.
- **The navigation.** The function that turns the pages' front matter into the sidebar, the order and the next and previous links is plain data in and out, and has unit tests.
- **Accessibility and behaviour.** Playwright opens the built site and runs axe on the home page, one guide, one reference page and the 404, in light and dark, and at phone and desktop widths. It also drives the theme toggle, the stack switcher, the copy button, the mobile menu and search from the keyboard. Prior art: the whole-stack journeys, which already run axe with `@axe-core/playwright`.
- **No script, no problem.** One test loads a docs page with scripts off and checks the text and the navigation are there.
- **Weight.** A test fails when a docs page's scripts pass a size the first ticket sets from the first build.

## Out of scope

- Hosting, DNS and the deploy to robkit.dev. They wait for R.
- Docs for more than one robkit version. There is one version, the next release.
- Translations, a blog, a showcase and a changelog page.
- The deployment cookbook for hosts other than Coolify, and pages on backups, observability and secret rotation. The map lists all of them as not yet specified.
- Native Windows. The docs say to use WSL, and ticket 21 of "Just use it" waits for R.
- Analytics and any third-party script.
- Changing robkit's code. Where a page can't be written because the code is wrong or unclear, the builder opens a `needs-triage` ticket and writes around it.

## Further notes

- Ticket 20's comments, under "For the docs site's builder", give the best source for each subject and the gaps no doc covers. Start there.
- robkit isn't on npm. Every command the site shows is tested from a local registry in the repo's own tests, and works for a reader only after R's first release.
- The install's own `README.md` and `AGENTS.md` stay as they are. The site is for people who haven't made an install yet, or who want the long form.
