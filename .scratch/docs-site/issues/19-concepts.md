# 19: Concepts

**What to build:** The pages that explain how robkit works, for a reader who wants to trust it.

- **How it works.** The hub, core, an app and its guard, and how a sign-in becomes a session and a token an app verifies by itself. A diagram drawn as SVG, in both themes, with a text version beside it. From `docs/architecture.md`, for an owner and not a contributor.
- **Security.** What robkit protects, and what an imported app can and can't do, written for an owner. Then the known gaps, built from `SECURITY.md`'s own list when the site builds, so a gap can't be added, dropped or reworded there without the page following. A link in that list into `.scratch/` becomes a link to the file on GitHub. How to report a vulnerability, with the address `SECURITY.md` gives.
- **Glossary.** Built from `GLOSSARY.md` when the site builds. Each term has an anchor other pages link to.

Milestone 4 changes `SECURITY.md` in several places (tickets 23, 27, 29 and 31 of "Just use it"). The built parts follow by themselves. Ticket 26 reads the written parts again.

**Blocked by:** 03, 05

**Status:** done

- [x] The glossary page has every term `GLOSSARY.md` has, and a term added there appears with no edit to the site
- [x] The known gaps on the page are `SECURITY.md`'s, and a gap added or reworded there changes the page with no edit to the site
- [x] The page gives the way to report a vulnerability that `SECURITY.md` gives
- [x] The diagram has a text alternative that says what it shows
- [x] `GLOSSARY.md`, `SECURITY.md` and `docs/architecture.md` are among the site's turbo inputs
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- Three pages under Concepts, in this order: How it works, Security, Glossary.
- **Built parts.** `site/src/built.ts` names each part built from a repo file, and `repo-markdown.ts` cuts and reshapes it. A `built` content collection renders each one with Astro's own Markdown renderer on every build. `<Built id="...">` shows a part on a page. A part whose id is a page's id ends that page, and its headings join the page's list, which is how the glossary's terms get in the "On this page" list.
- **Glossary.** It's built from `GLOSSARY.md`'s "Language" section. Each group is a section and each term a heading, so each term has an anchor, such as `/docs/concepts/glossary/#viewer`. A term in bold in another's meaning links to it. The "Avoid" lines are for whoever writes robkit's words, so the page leaves them out. Relationships, the example dialogue and the flagged ambiguities stay in the repo.
- **Security.** What robkit protects and what an imported app can and can't do are written for an owner, from `SECURITY.md`. Two lists are built: the known gaps, and the known ways past `robkit check`. A relative link in either goes to the file on GitHub, so ticket 29's link works.
- **How it works.** It's written from `docs/architecture.md` for an owner, with no package map. The diagram is an inline SVG in the style guide's tokens, with ten numbered arrows between the browser, an app, the hub and core. A numbered list after it says each step in words.
- The layer rule page's fifth rule now says a `.d.ts` file may import another from a folder `robkit check` doesn't read, as the install's `AGENTS.md` says. Its "What it doesn't stop" section links to the security page's list.

**Proof**

- `repo-markdown.test.ts` covers each reader. That includes a term added to a glossary appearing with no other change.
- `built.test.ts` holds each built part to the real files. The glossary has a heading for every term in `GLOSSARY.md`, each known gap is a line of `SECURITY.md` with no `.scratch/` link left relative, and each way past the lint is in `SECURITY.md`.
- Built-site tests:
  - **Glossary:** every term in `GLOSSARY.md` has a heading with its anchor, every link to a term finds its heading, and the edit link names `GLOSSARY.md`.
  - **Security:** the known gaps on the page match `SECURITY.md`'s list in count and first item, ticket 29's link goes to GitHub, the ways past the lint match in count, and the page links to the reporting address `SECURITY.md` gives.
  - **How it works:** the diagram is an image with a title and a description, and the list after it has as many steps as the diagram has arrows.
  - **Layer rule:** a `.d.ts` file importing `./dist/dev/types/routes.d.ts` passes `robkit check`, and the page has the install `AGENTS.md`'s `.d.ts` sentence.
- With no edit to the site, I added a term to `GLOSSARY.md`, and added and reworded a gap in `SECURITY.md`, then built. The glossary had the new term's heading, and the security page had the new gap and the reworded one. I then put both files back.
- After merging `docs-site` with just-use-it ticket 42, the security page lists "A `.d.ts` file with code in it" with no edit.
- `turbo.json` has `GLOSSARY.md`, `SECURITY.md` and `docs/architecture.md` among the inputs of the site's build, test and test:unit. `turbo-inputs.test.ts` passes.
- `concepts.browser.test.ts` runs axe on the three pages at 375 and 1280 pixels in both themes, and checks none scrolls sideways at 375 pixels. I looked at screenshots of the diagram in both themes, and moved label 7 off its arrowhead.
- The site's build, lint, typecheck and all 300 tests pass at 100% coverage. The repo's glossary test passes.

**What the next tickets need**

- To build another part of a page from a repo file, add it to `builtParts` in `built.ts`, read the file with `readRepoFile("...")`, and add the file to `turbo.json`'s site inputs. Ticket 20 or 22 could build a list this way.
- `front-matter.test.ts` copies `content.config.ts` and what it imports into a throwaway site. A new import there needs adding to its list.
- The glossary page shows `GLOSSARY.md`'s words as they are. Stack's meaning says "framework", which the site's prose check refuses in pages written for the site. The check reads the `.mdx` files, not built parts.
- Astro's build turns `'` into `’`, in a heading's text too. A test that compares built text with a source file swaps them back first.

**What milestone 4 and ticket 26 change**

- Milestone 4 is merged. The built parts follow `SECURITY.md` by themselves, tickets 23, 27, 29 and 31 included. Ticket 26 reads the written parts of Security and How it works again against the release.
