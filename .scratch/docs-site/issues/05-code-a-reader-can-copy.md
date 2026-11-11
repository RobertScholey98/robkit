# 05: Code a reader can copy

**What to build:** The pieces every docs page needs to show code.

- **Code blocks.** Shiki colours them from the style guide's tokens, in both themes, with no script. A block may carry a file name. A command block looks different from a file's contents.
- **A file from the templates.** A component shows a file, or a named part of one, read from `packages/create-robkit/templates` when the site builds. A page that shows an install's own file uses it and never pastes the file's text, so what the page shows is what `robkit add` writes. A path that doesn't exist fails the build.
- **A copy button** on every block. It says it copied, to the eye and to a screen reader. When the browser refuses the clipboard it says so, and the code can still be selected.
- **A stack switcher.** A sample that differs by stack shows one stack at a time: TanStack Start, React + Hono, React + Express, Next.js, React + Go. The reader's choice holds across pages. With scripts off, every stack's sample shows, each under its name. The stacks come from `readyStacks` in create-robkit, so a sixth can't be missed.
- **Callouts** for a note and a warning, used sparingly.
- **The pre-release line.** A component that says the packages aren't on npm yet, with the way to make an install from a checkout. One switch in the site's settings removes it everywhere.
- The samples page from ticket 04 shows each piece for the browser tests.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] A template file shown on a page matches the file in `packages/create-robkit/templates`, and a missing path fails the build with the page's name
- [ ] The copy button copies the block's text exactly and announces it, and reports a refused clipboard
- [ ] The stack switcher works from the keyboard, its choice holds on the next page, and its stacks are `readyStacks`
- [ ] With scripts off, every stack's sample is on the page under its stack's name
- [ ] Code blocks pass axe's contrast check in both themes
- [ ] Turning the pre-release switch off removes the line from every page that had it
- [ ] The samples page stays under the script size ticket 02 recorded
- [ ] The PR's CI `gate` job passes on GitHub
