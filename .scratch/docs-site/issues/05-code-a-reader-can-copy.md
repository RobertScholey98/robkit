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

**Status:** done

- [x] A template file shown on a page matches the file in `packages/create-robkit/templates`, and a missing path fails the build with the page's name
- [x] The copy button copies the block's text exactly and announces it, and reports a refused clipboard
- [x] The stack switcher works from the keyboard, its choice holds on the next page, and its stacks are `readyStacks`
- [x] With scripts off, every stack's sample is on the page under its stack's name
- [x] Code blocks pass axe's contrast check in both themes
- [x] Turning the pre-release switch off removes the line from every page that had it
- [x] The samples page stays under the script size ticket 02 recorded
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- Shiki colours code with its `css-variables` theme. `base.css` points Astro's `--astro-code-*` variables at four new tokens in DESIGN.md: keyword (rose), string (green), function (blue) and constant (violet). Comments and punctuation take `--color-muted`, the rest `--color-text`. Each colour is 6 to 1 or more on `--color-code-bg` in both themes, and DESIGN.md lists the numbers. Amber stays out of code.
- JetBrains Mono's ligatures are off in code, so `=>` shows as two characters, and a tab is 4 columns.
- Every block is in `CodeFrame.astro`. Its bar names the file, says "Terminal" for `sh`, `bash` and `shell`, or names the language. A fence's `title="..."` names the file. A Shiki transformer in `astro.config.ts` carries it to the `pre`, and `fenceTitle()` in `src/code.ts` reads it.
- A command block puts `$ ` before each line in CSS, so it isn't copied or selected.
- MDX hands every `pre` to `CodeBlock.astro`. A docs page gets it from `[...slug].astro`. A page under `src/pages` must say `export const components = { pre: CodeBlock }`, as `samples.mdx` does.
- The copy button copies the `pre`'s text. It says "Copied" on the button and in a `role="status"` region for 2 seconds. When the clipboard refuses, it says "Couldn't copy", and the region asks the reader to select the code. It is `hidden` until its script runs.
- `<TemplateFile path="stacks/go/main.go" from="func main()" to="^}" />` shows a template file, or part of one. `from` is text only the part's first line has, and `to` is text its last line has. A leading `^` means the line starts with the rest. The part's shared indent is taken off. The bar names the file as an install does: `base/x` is `x`, and `stacks/<stack>/x` is `apps/example/x`, or `apps/<app>/x` with `app="notes"`. A wrong path or part fails the build with `/<page>/: ...`.
- The site's turbo inputs now take `packages/create-robkit/templates/**` in place of two named files. `turbo-inputs.test.ts` also reads each `<TemplateFile path="...">`.
- `<StackSwitch>` takes one `<Fragment slot="<stack>">` per stack. Its tabs are `switcherStacks` in `src/stacks.ts`: create-robkit's `stacks`, filtered to `readyStacks`, in that order. A switcher with no sample for a stack fails the build, naming the page and the stack. The site now depends on create-robkit, and `package-graph.js` allows it.
- The switcher follows the ARIA tabs pattern, with arrow keys, Home and End. The choice is stored as `robkit-stack`, and the head script sets `data-stack` on `<html>` before paint, so the chosen sample shows first with no flash. A stored stack no switcher offers gives way to the first. Without scripts, the tabs are hidden and each sample shows under its stack's name.
- `<Callout>` is a note, and `<Callout kind="warning">` a warning. Each is `role="note"`, not an `<aside>`, since axe flags an `<aside>` inside `<main>`.
- `<PreRelease />` is the pre-release line, a note. `preRelease` in `site.ts` is the switch. It replaces What you need's own "Before the first release" section, which now opens the page, and the home page shows it under its commands. The line links to the README's quickstart, which shows the clone route today.
- `/ui-ux-pro-max` had no entry for code blocks, copy buttons or tabs. I followed its general rules instead: 4.5 to 1 contrast, a 44 px target, keyboard reach, a visible label beside each icon, and feedback announced to a screen reader.

**Proof.**

- `samples.browser.test.ts`, in Chromium:
  - axe finds nothing at 375 and 1280 px, light and dark, and a keyword has the token's colour.
  - Code has no ligatures and 4-column tabs.
  - The command block's lines each have a `$ ` before them.
  - The copy button hands the clipboard `pnpm robkit add notes\npnpm dev`, from a click and from Enter, and says "Copied" on the button and in the status region.
  - With `writeText` refused, it says "Couldn't copy" and the status asks the reader to select the code.
  - With scripts off, there is no copy button and the code shows.
  - The switcher's tabs are `switcherStacks`' names, in order, with TanStack Start chosen first.
  - ArrowRight, End, ArrowRight, ArrowLeft and Home each choose the right tab, focus follows, and Tab then reaches the panel.
  - After choosing Next.js and opening another page, `/samples/` opens on Next.js with only its sample shown.
  - With scripts off, there are no tabs, and all five samples show, each under its name, with its own command.
  - The callouts say Note, Warning and Note.
- `stacks.test.ts` checks `switcherStacks` against `readyStacks`, and the message for a missing stack.
- `built-site.test.ts` checks that `apps/example/go.mod` on `/samples/` is the template's `go.mod`, and that `apps/example/main.go` is the template's `func main` to its closing brace.
- With `stacks/go/nope.mod` on the samples page, `astro build` failed with "/samples/ shows packages/create-robkit/templates/stacks/go/nope.mod, which doesn't exist." With the Go sample taken out of the switcher, it failed with "/samples/ has a stack switcher with no sample for React + Go."
- `built-site.test.ts` checks each built page: while `preRelease` is on, a page has the line exactly when its text shows `npm create robkit`. I set `preRelease` to false and built. No page had the line or its words, and the same test passed. Then I set it back. Today three pages have it: the home page, What you need and the samples page.
- `weight.test.ts` now measures the samples page too. Its scripts come to 1,924 bytes gzipped, against 10 KB.
- In WSL with Go, `turbo run test:unit` for the site and repo-checks passed: 92 and 316 tests. On Windows, `turbo run lint typecheck` over every package, `pnpm knip` and `pnpm format:check` pass, and the site's 34 browser tests pass.
- I looked at the samples page at 375 and 1280 px in both themes, and at the switcher with scripts off.

**For the next tickets.**

- Show a file from an install with `<TemplateFile>`, never a pasted fence. Ticket 06's example route can use `from` and `to` for one handler.
- Give a fence a file name with `title="..."`. The `sh`, `ts`, `tsx` and `go` checks from ticket 04 still read the fence.
- A page that shows `npm create robkit` needs `<PreRelease />`, or the built-site test fails. Ticket 07's quickstart can give the clone route its own section, and the line can then link there instead of to the README.
- A page under `src/pages` that has fences needs `export const components = { pre: CodeBlock }`.
- Ticket 24's Markdown output must turn `<StackSwitch>`, `<TemplateFile>`, `<Callout>` and `<PreRelease>` into text. Every stack's sample sits in the built HTML, under `[data-stack-panel]`, with its name in `.name`.
- Ticket 26 turns `preRelease` off.
- Tests that build the site, compile TypeScript or open a browser run several times slower in CI. Give each a limit many times its local time.

**What milestone 4 will change on these pages.**

- Ticket 27 (the templates finished) changes the template files that `<TemplateFile>` shows. The samples page's `from="func main()"` part fails the build if `main.go` loses that line.
- A new stack in create-robkit's `stacks` makes every `<StackSwitch>` fail the build until each has a sample for it.
