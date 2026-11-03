# 25: One table of init's choices

**What to build:** Each of init's choices (package manager, ORM, UI kit, stacks, dev tools) is described once: its flag, its options, each option's label, which options are ready and which are "coming later", and the template layer each option adds. The flag parser, the usage text, the wizard and the generator all read that table. Adding an option, as tickets 13 to 20 do, becomes one edit to the table plus the option's template layer.

**Blocked by:** 24

**Status:** done

- [x] The usage text is built from the table, and a test checks it lists every ready option
- [x] The wizard's labels and "coming later" options come from the table
- [x] The generator picks each choice's template layer from the table, the UI kit included, rather than building folder paths in its own code
- [x] Every install the existing tests generate is unchanged, and the generator's snapshot passes

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The table.** `choiceTable` in `packages/create-robkit/src/choices.ts`. Each choice has its flag, its wizard question, what the usage text calls it, whether it takes one option or a list (`orNone` lets a list be `none`), and its options. Each option has its value, label, an optional hint, an optional template `layer` under `templates/`, and `comingLater`. `readyOptions(choice)` gives the options init can make. The types `PackageManager`, `Orm`, `Generator` and `Tool` are the ready values, so making an option ready widens them.
- **Adding an option (tickets 13 to 20).** Drop `comingLater` and add `layer` on its entry, then add the folder. The usage text, the flag, the wizard and the generator pick it up. A test fails if a ready option names a layer with no folder, or a ready stack has none.
- **The UI kit (ticket 15).** The table gives it a flag, `--ui-kit`, which takes only `none` today, and the printed command now repeats `--ui-kit none`. Chosen in the build, awaiting R's review. `Choices.uiKit` stays typed `null` while no kit is ready, because a `UiKit | null` type would be `never | null`. Ticket 15 adds a `UiKit` type from the table's ready kits, has `choicesFromFlags` map `none` to `null`, and reads `choices.uiKit` in the generator's `layersFor` instead of the no-kit layer. The wizard already asks "Which UI kit?" once Yes has a ready kit.
- **Drizzle** has no layer: core keeps it inside `@robkit/core`, and the example apps query Postgres directly. Prisma and Kysely (13, 14) will be the first ORM layers. Root layers go down in the table's order: base, package manager, ORM, UI kit, then tools.
- **For tickets 10 and 18.** `create-robkit` exports only `init`, `defaultChoices` and the choice types. `robkit add` (10) and the package manager adapter table (18) can import `choiceTable` and `readyOptions` from `choices.ts`, or have them added to `index.ts` once something outside the package needs them.
