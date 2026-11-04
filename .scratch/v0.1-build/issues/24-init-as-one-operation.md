# 24: Init is one operation

**What to build:** `npm create robkit` runs four steps in order: generate the install, write it, install dependencies and initialise git. Today only the command line knows that order, and the whole-stack test copies it without git. After this ticket, one exported init operation takes the choices and a folder to a finished install. The command line and the whole-stack test both call it, so CI makes its installs exactly as a user's init does.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The command line and the whole-stack test call the same init operation
- [x] Whether to install and initialise git is a parameter of that operation, with the same defaults as today
- [x] The printed next steps and the printed repeat command are unchanged, and the existing command-line tests pass

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The operation.** `init(choices, dir, { install, link })` in `packages/create-robkit/src/init.ts`, exported from `create-robkit`, which now exports nothing else but `defaultChoices` and the choice types. `install` is one switch for installing dependencies and initialising git, since the wizard asks them as one question. It defaults to off, as the command line does without `--install`.
- **For ticket 25.** init takes a `Choices`. The command line still turns flags or answers into one with `choicesFromFlags`. The table of choices can replace that function and `Choices` without touching init. The generator's `layersFor(choices)` is where the table's template layers plug in.
- **The whole-stack test.** Its installs now come from `init` with `install` and `link`, so they're git repositories, as a user's are. `install-checks.test.ts` checks it.
