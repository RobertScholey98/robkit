# A tour of an install

This is what `pnpm create-install ../my-install --stack start` writes, before `pnpm install`. Each folder says what it's for and which robkit packages it takes. To look at a real one without keeping it, run `pnpm preview-install` (see [create-robkit's README](../packages/create-robkit/README.md#change-a-template)).

```text
my-install/
├── apps/
│   ├── core/              core's process: runs @robkit/core, migrates, provisions
│   ├── hub/               the sign-in page and the launcher
│   ├── admin/             access codes, roles and who may open each app
│   └── example/           the example app, on the stack you picked
├── packages/
│   ├── core-client/       how the hub and admin call core, and a fake core for their tests
│   ├── theme/             the install's colours and sizes, as CSS variables
│   └── ui/                the UI kit: shadcn on Base UI
├── tooling/
│   ├── eslint/            robkit's lint policy, copied from robkit's tooling/eslint
│   └── typescript/        the shared tsconfig
├── docs/deploy.md         the runbook for hosting the install on Coolify
├── .github/workflows/ci.yml   lint, typecheck and tests on every push
├── .husky/pre-commit      lint-staged: ESLint's fixes and Prettier on staged files
├── compose.yaml           Postgres for pnpm dev
├── Dockerfile             one image per app, built from a turbo-pruned workspace
├── eslint.config.js       the root lint config, on top of tooling/eslint
├── lint-staged.config.js
├── package.json           pnpm dev, lint, typecheck, test, and pnpm robkit
├── pnpm-workspace.yaml    the workspace, the catalog of versions, and links to robkit's packages
├── robkit.json            what init asked: the example app's stack
├── turbo.json
├── AGENTS.md, CLAUDE.md   the install's own rules, for people and agents
└── .gitignore, .dockerignore, .prettierignore
```

## The apps

Every folder under `apps/` is an app. `robkit-dev` gives each one a subdomain, `<slug>.robkit.localhost:3000`, and an app with a `migrate` script its own Postgres schema and role.

| Folder         | What it is                                                                                                                                    | robkit packages it imports                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/core`    | Starts core. `src/main.ts` runs it, `src/migrate.ts` migrates core's schema, and `src/provision.ts` gives each app its database in production | `@robkit/core`, `@robkit/dev`, `@robkit/input`                                                             |
| `apps/hub`     | The page people sign in on, and the launcher of the apps they may open. A Vite app that calls core through `packages/core-client`             | `@robkit/input`                                                                                            |
| `apps/admin`   | The owner's page for access codes, roles and each app's rule. Its server is Hono, behind the guard                                            | `@robkit/hono`, `@robkit/guard`, `@robkit/input`                                                           |
| `apps/example` | An app on the stack you picked, with a Drizzle schema and its migrations. On Start, a page that counts visits                                 | Start: `@robkit/start`, `@robkit/react`, `@robkit/input`. React with Hono: `@robkit/hono`, `@robkit/input` |

`pnpm robkit add notes` writes `apps/notes` the same way as the example, from either stack's template.

## The shared packages

| Folder                 | What it is                                                                                                          | robkit packages it imports |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `packages/core-client` | `callCore`, which the hub and admin call core with, and `fakeCore`, which their tests answer from                   | `@robkit/input`            |
| `packages/theme`       | `theme.css`, the install's tokens. Only it sets them; the hub and admin draw with Tailwind classes named after them | none                       |
| `packages/ui`          | shadcn's components on Base UI, committed as shadcn wrote them. Every app draws with it                             | none                       |

The install owns these files. robkit's packages update when the install takes a new version; the files above don't ([ADR 0008](adr/0008-packages-update-apps-are-owned.md)).

## The tooling

- `tooling/eslint` is robkit's own lint policy, `policy.js` and the rules it imports, copied whole from robkit's `tooling/eslint` at init. The root `eslint.config.js` imports it.
- `pnpm lint` runs `robkit check` first, the install's layer rule: an app never imports another app, a shared package never imports an app, nothing imports `@robkit/core`, and handlers take the viewer from their adapter. Then it runs ESLint.
- The install's root `package.json` takes `@robkit/dev`, for `pnpm dev`, and `create-robkit`, for `pnpm robkit`, as dev dependencies.

## Where robkit's packages come from

`pnpm-workspace.yaml`'s catalog names every version, robkit's packages included. An install made with `--link`, as `pnpm create-install` and `pnpm preview-install` make, also has `overrides` there that link each `@robkit/*` package to this checkout, so a change under `packages/` shows up in the install at once. Once robkit is on npm, an install takes them from there.

[docs/architecture.md](architecture.md) shows how a request goes through these pieces.
