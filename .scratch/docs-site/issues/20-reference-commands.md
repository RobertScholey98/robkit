# 20: Reference: every command

**What to build:** One reference page for `npm create robkit` and one for the `robkit` command an install runs. Each command has what it does in a sentence, its arguments and options with their defaults, one example of what it prints, and what makes it refuse.

- **Public usage only.** The pages cover what the usage text shows. `robkit upgrade --finish` is the handover between upgrade's two steps, which an owner never types, and stays off the page.
- **Held to the usage text.** Ticket 04 exported the list of commands. This ticket's test reads each command's usage and fails where a command or an option is in one and not the other. If the options aren't exported yet, export them the same way.
- **Options are checked where they are read.** For each option, check its value and its default against the code that parses it, and name the place in the Proof.

Milestone 4 changes `robkit deploy` and `robkit check` (tickets 22 and 23 of "Just use it"). The test shows what moved when that lands.

**Blocked by:** 03, 05

**Status:** done

- [x] Every command and option in the usage text of `create-robkit` and `robkit` is on a page, and nothing is on a page that the usage text lacks
- [x] A command or option added to the usage text and not to the page fails a test, and so does the reverse
- [x] Each command's page gives an example of its output and what makes it refuse, from the code
- [x] The command's source files are among the turbo inputs of the test
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose**

- Two pages under Reference: `npm create robkit` (order 1) and "The robkit command" (order 2), with one `## robkit <command>` section per command. The settings stub moved to order 3.
- Each option is a list item that starts with the option in code, such as "`--stack <stack>`. The stack, one of ... By default, `start`." The test reads the options from those items.
- The test runs the commands and reads what they print, instead of importing an options list. `pnpm robkit nope` prints every command's usage line, and `npm create robkit one two` prints init's options. So the test holds the page to the text an owner sees, and no export was needed. `robkitCommands` from ticket 04 still checks that the usage text names every command.
- `robkit upgrade --finish` isn't in the usage text, so it isn't on the page.
- The examples for `robkit check`, `robkit database-urls` and `robkit deploy` with no `COOLIFY_URL` are made by the test in an install it makes with `init({ install: false })`, and must match the page. database-urls' passwords are shown as `<the password robkit derives>`. The other examples need `pnpm dev`, Docker or a checkout, so a run in WSL proved them (below).

**Proof**

- `site/src/reference-commands.test.ts` (8 tests) checks that the page's commands match the usage text, that each command's options match both ways, that both pages give the stacks `readyStacks` lists, and the three examples above.
- I changed an option on the built page so it no longer matched the usage text. Both usage tests failed, then passed when I rebuilt the page.
- Where each option is parsed, and its default:
  - `npm create robkit`: `readArgs` in `packages/create-robkit/src/init-command.ts` takes `--stack` (checked by `stackFrom` in `choices.ts`), `--no-install` and `--link`, both off by default. With `--stack` and no folder, it fails with the usage text.
  - `robkit add`: `readArgs` in `robkit-command.ts` takes `--stack`, `--access`, `--roles` and `--icon`. `add-wizard.ts` sets the defaults: the stack `defaultChoices.exampleStack` (`start`), the access `owner`, and the icon `defaultIcon` from `generate.ts` (📦).
  - `robkit deploy`: `readArgs` in `robkit-command.ts` takes `--all`, `--apps` and `--dry-run`, with `--all` and `--dry-run` off by default.
  - `robkit upgrade` takes one version, or none for the newest. `--finish` is internal.
- A run in WSL, in an install made from this branch with `--link` and Postgres on port 25442, printed the page's lines:
  - create: the "Made a robkit install" steps, and its refusal of a folder that isn't empty, of `--stack vue` and of `--stack` with no folder.
  - add with `pnpm dev` running: "Added apps/notes. pnpm dev started notes at ...". It refused `core`, `--access roles` with no `--roles`, and `--roles` with no `--access roles`.
  - migrate: "pnpm dev migrated notes.", and its refusal of no slug and a bad slug. With no `pnpm dev` it said so and exited 0, so the page says that, not that it refuses.
  - check (nothing, exit 0), deploy with no `COOLIFY_URL`, `deploy --dry-run` with no `coolify.json`, vendor's line, and upgrade after vendor.
- `turbo.json` has `packages/create-robkit/src/**` among the inputs of the site's build, test and test:unit. `turbo-inputs.test.ts` passes.
- `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass in `site/`, and the repo's glossary test passes.

**What the next tickets need**

- `site/src/test/built.ts` now has `itemsAfter` and `codeBlocks` beside `built`, for any test that reads a built page.
- The pre-release test in `built-site.test.ts` ignores `<nav>` elements, since the sidebar and the pager now name the `npm create robkit` page on every page.
- Ticket 21 replaces the settings stub at `reference/settings.mdx`, order 3.

**What milestone 4 and ticket 26 change**

- When just-use-it tickets 22 and 23 change `robkit deploy` or `robkit check`, `reference-commands.test.ts` fails on any option or usage line that moved, and on check's and deploy's examples if what they print changes. Update the page to match.
