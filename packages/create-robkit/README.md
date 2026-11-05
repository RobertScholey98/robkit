# create-robkit

`npm create robkit` and the `robkit` command. Init writes an install: core, the hub, admin, one Postgres and an example app. Inside an install, `robkit` adds apps, checks the layer rule, and deploys to Coolify.

People making an install run init once. Every install takes `create-robkit` as a dev dependency and runs `robkit` through its `pnpm robkit` script. robkit's whole-stack test calls `init` directly.

## Example

The packages aren't on npm yet, so make an install from a checkout of this repo:

```sh
pnpm install
pnpm create-install                                  # asks for a folder and the example's stack
pnpm create-install ../my-install --stack start      # or asks nothing
```

`pnpm create-install` runs `src/bin.ts --link --install`: it links the install's `@robkit/*` packages to this checkout, initialises git and installs dependencies. Once the packages are on npm, `npm create robkit my-install -- --stack start --install` will do the same without the checkout.

Inside an install:

```sh
pnpm robkit add                                       # asks for the name, stack, who may open it and an icon
pnpm robkit add notes --stack react-hono --access roles --roles Family --icon 📝
pnpm robkit check                                     # the install's layer rule; pnpm lint runs it
pnpm robkit vendor                                    # packs the linked packages into vendor/robkit
```

`robkit database-urls` and `robkit deploy` are for production. The install's `docs/deploy.md` is the runbook for both.

From code, as the whole-stack test does (`tooling/e2e/src/install.ts`):

```ts
import { init } from "create-robkit";

await init({ exampleStack: "start" }, "/tmp/my-install", {
  link: true,
  install: true,
});
```

## Exports

| Export                                                          | What it is                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `create-robkit` (bin)                                           | Init. Flags: `--stack <name>`, `--install`, `--link`                                           |
| `robkit` (bin)                                                  | `add`, `check`, `vendor`, `database-urls` and `deploy`, run inside an install                  |
| `init(choices, dir, options)`                                   | Generates and writes an install, then with `install` initialises git and installs dependencies |
| `Choices`, `defaultChoices`                                     | What init asks: `{ exampleStack }`. The default is `start`                                     |
| `stacks`, `readyStacks`, `stackFrom`, `Stack`                   | The stacks: `start` (TanStack Start) and `react-hono` (React with Hono)                        |
| `deploymentOf(...)`, `Deployment`, `DeploymentOptions`, `Value` | Each app's Coolify variables, as `robkit deploy` sets them                                     |

`src/choices.ts` lists the stacks. A new stack is one entry there plus its folder in `templates/stacks/<name>`. `templates/base` is the install itself.

## What it must never do

- Ask for more than the folder and the example's stack. Every install has the same tooling ([ADR 0009](../../docs/adr/0009-one-opinionated-stack.md)).
- Touch the network at init. The UI kit is committed shadcn output, which `pnpm --filter create-robkit shadcn-kit` regenerates.
- Do more than write files in `robkit add`. The next `pnpm dev` provisions and starts the app.
- Lint or typecheck the templates as robkit's own code. They are an install's files, and the whole-stack test checks them in a generated install.
