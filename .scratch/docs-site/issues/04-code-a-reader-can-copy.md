# 04: Code a reader can copy

**What to build:** The pieces every docs page needs to show code, and the checks that keep that code true.

- **Code blocks.** Shiki colours them from the design system's tokens, in both themes, with no script. A block may carry a file name. A command block looks different from a file's contents.
- **A copy button** on every block. It says it copied, to the eye and to a screen reader.
- **A stack switcher.** A sample that differs by stack shows one stack at a time: TanStack Start, React + Hono, React + Express, Next.js, React + Go. The reader's choice holds across pages. With scripts off, every stack's sample shows, each under its name.
- **Callouts** for a note and a warning, used sparingly.
- **The pre-release line.** A component that says the packages aren't on npm yet, with the way to make an install from a checkout. One switch in the site's settings removes it everywhere.
- **Examples compile.** The repo's doc-examples check reads the site's pages, so every `ts` and `tsx` fence compiles against the built packages. `nocheck` marks a deliberate fragment.
- **Words are checked.** The repo's glossary check reads the site's pages.
- A page of samples in the site's folder, left out of the navigation, shows each piece for the browser tests.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A `ts` fence in a site page that doesn't compile fails the doc-examples check, which names the page and line
- [ ] A word the glossary avoids, in a site page, fails the glossary check
- [ ] The copy button copies the block's text exactly, and announces it
- [ ] The stack switcher works from the keyboard, and its choice holds on the next page
- [ ] With scripts off, every stack's sample is on the page under its stack's name
- [ ] Code blocks pass axe's contrast check in both themes
- [ ] Turning the pre-release switch off removes the line from every page that had it
- [ ] The PR's CI `gate` job passes on GitHub
