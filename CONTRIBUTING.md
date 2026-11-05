# Contributing to robkit

Thanks for helping. This page gets you from a fresh machine to a merged change. The words it uses (install, core, hub, guard, viewer and so on) are defined in [GLOSSARY.md](GLOSSARY.md), and [docs/architecture.md](docs/architecture.md) shows how the pieces fit.

## Prerequisites

- **Node 24.** `.node-version` names it.
- **pnpm 11, through Corepack.** Run `corepack enable` once. The root `package.json` pins the exact pnpm version, and Corepack uses it. A pnpm installed some other way may be the wrong version.
- **Docker**, with Compose. The tests for core, the dev runner and the whole-stack test start their own Postgres containers.
- **Linux or macOS** for the full test suite and `pnpm dev`. The dev runner stops apps with POSIX process groups.

### On Windows, use WSL

Lint and typecheck work on Windows. `pnpm dev` and the full suite need WSL:

1. Install Ubuntu: `wsl --install -d Ubuntu-22.04`.
2. Install Docker Desktop and turn on its WSL integration for that distro (Settings, Resources, WSL integration).
3. In Ubuntu, install Node 24 with nvm and enable Corepack:

   ```sh
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install 24
   nvm alias default 24
   corepack enable
   ```

4. Clone robkit into Ubuntu's own file system, such as `~/robkit`, not under `/mnt/c`. The suite is much slower across the two file systems.
5. If Docker can't pull images because of Docker Desktop's credential helper, point Docker at an empty config:

   ```sh
   mkdir -p ~/.docker-empty && echo '{}' > ~/.docker-empty/config.json
   export DOCKER_CONFIG=~/.docker-empty
   ```

## Set up

```sh
git clone https://github.com/RobertScholey98/robkit.git
cd robkit
pnpm install
```

To try a change the way a user would, make an install linked to your checkout:

```sh
pnpm create-install ../my-install --stack start   # or with no arguments, and it asks
cd ../my-install
pnpm dev                                          # then open http://hub.robkit.localhost:3000
```

The install uses your checkout's `@robkit/*` packages, so a change in `packages/` shows up there.

## Check your work

There are two gates.

| Command          | What it runs                                                                                              | Needs Docker | Time               |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------ | ------------------ |
| `pnpm check`     | Prettier's check, lint, typecheck, and every test that needs no Docker                                    | No           | Under a minute     |
| `pnpm check:all` | What CI runs: Prettier's check, lint, typecheck and every test, the whole-stack test in Chromium included | Yes          | About four minutes |

Run `pnpm check` while you work and `pnpm check:all` before you open a pull request. The whole-stack test needs Chromium once: `pnpm --filter @internal/e2e exec playwright install --with-deps chromium`.

The production test is separate. It builds each app's Docker image and runs the journey over https, and takes about nine minutes. CI runs it on every push to `main`, every night, and on a pull request labelled `production`. To run it yourself:

```sh
pnpm --filter @internal/e2e test:production
```

Other commands:

```sh
pnpm format                                       # format everything with Prettier
pnpm turbo run lint typecheck                     # lint and typecheck every package
```

### Run one package's tests

```sh
pnpm --filter @robkit/guard test                                  # one package
pnpm --filter @robkit/guard exec vitest run src/guard.test.ts     # one file
pnpm --filter @robkit/hono test -- -t "conformance"               # tests whose name matches
```

The tests in `@robkit/core`, `@robkit/dev`, `@internal/e2e` and `@internal/test-postgres` need Docker and Linux. `create-robkit`'s and `@internal/repo-checks`' tests need Linux. The rest run anywhere.

## How work is organised

### Tickets

Work is planned as markdown tickets under `.scratch/<feature>/issues/`, numbered in the order they should be built. `.scratch/kit/map.md` is the plan: every decision and the ticket that made it. [docs/adr/](docs/adr/README.md) holds a short record of each settled one.

Each ticket has a `**Status:**` line:

| Status            | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| `needs-triage`    | R hasn't looked at it yet                               |
| `needs-info`      | Waiting on R to answer its open questions               |
| `ready-for-agent` | Fully specified; anyone, human or agent, can pick it up |
| `ready-for-human` | R builds this one                                       |
| `wontfix`         | Won't be done                                           |
| `done`            | Finished                                                |

Take the lowest-numbered ticket that is ready and whose `**Blocked by:**` tickets are all `done`. If the ticket leaves a decision open, or the code contradicts it, ask R in the ticket or the pull request rather than guessing, and record the answer in the ticket and the map.

### Branches and pull requests

- One branch and one pull request per ticket. Name the branch after the ticket, such as `22-app-slugs-checked-at-start`.
- Open the pull request against `main`, or against the branch it builds on if it stacks on another ticket's.
- Say in the description what changed and why, how you proved it (the commands you ran and their results), and anything R must decide.
- R reviews and merges. Don't merge your own.

### Commits

R reviews commit by commit, so keep each one small and about one thing.

- One logical change per commit. A test goes in the same commit as the behaviour it covers.
- Refactors, renames and formatting get their own commits, apart from behaviour changes.
- Write the subject in the imperative, under about 60 characters: "Add a README to each package", not "Added READMEs". Use the body to say why when the diff doesn't show it.
- If the subject needs an "and", split the commit.

### Writing

Write docs, tickets, commit messages and pull requests in short, plain sentences, with the answer before the detail. Use the glossary's words: "core" and "hub", never "backend" and "frontend"; "role", never "grant".

## A first change, from ticket to pull request

Say a ticket asks that an access rule gated to roles must name at least one. Today `readAccessRule` accepts `{ "kind": "roles", "roles": [] }`, which quietly makes an app owner-only. Here is the whole loop.

1. **Read the ticket and the code it names.** `readAccessRule` is in `packages/guard/src/guard.ts`, and its tests are in `guard.test.ts` beside it. Core, admin and `requestGuard` all read rules through it.

2. **Branch.**

   ```sh
   git switch -c 43-roles-rule-names-a-role main
   ```

3. **Write a failing test through the public interface.** Add the empty list to the values `readAccessRule` refuses, in `guard.test.ts`:

   ```ts
   { kind: "roles", roles: [] },
   ```

   Run the guard's tests and watch it fail:

   ```sh
   pnpm --filter @robkit/guard test
   # FAIL  src/guard.test.ts > readAccessRule > refuses {"kind":"roles","roles":[]}
   ```

4. **Make it pass.** In `readAccessRule`, require at least one role:

   ```ts
   const isRoleList =
     Array.isArray(roles) &&
     roles.length > 0 &&
     roles.every((role) => typeof role === "string");
   ```

   Run the tests again, and the packages that use it:

   ```sh
   pnpm --filter @robkit/guard test
   pnpm --filter @robkit/session test
   ```

5. **Commit the test and the change together.**

   ```sh
   git add packages/guard
   git commit -m "Refuse a roles rule that names no role"
   ```

6. **Run the gates.** `pnpm check`, then `pnpm check:all`.

7. **Finish the ticket.** Tick its acceptance criteria, set `**Status:** done`, and add a `## Comments` section at the bottom with what you chose, how you proved it, and anything the next ticket needs. Commit that on its own.

8. **Push and open the pull request.**

   ```sh
   git push -u origin 43-roles-rule-names-a-role
   gh pr create --base main
   ```

## When a test fails

- **Rerun it alone** before you change code: `pnpm --filter <package> exec vitest run <file>`. Under load, a test can fail for reasons that aren't the code. In WSL, Node 24 occasionally crashes under a heavy gate; rerun before you blame the change.
- **A whole-stack journey prints what its browser saw** when it fails: console errors, failed requests, every 4xx and 5xx answer, each open page's text, and what the dev runner said meanwhile. Start with that output.
- **Screenshots.** Set `E2E_SCREENSHOTS=<folder>` and the whole-stack test saves each page it checks there:

  ```sh
  E2E_SCREENSHOTS=/tmp/shots pnpm --filter @internal/e2e test
  ```

- **A failed production journey** prints what the browser saw and each container's state and last logs.
- **Leftover containers.** Every test registers what it starts, and a watcher removes it when the test process exits, however it ends. If a machine crashed mid-run, `docker ps` shows any `robkit-test-*` or `robkit-install-*` containers left; remove them before the next run.
- **`ERR_NETWORK_CHANGED` in Chromium** where Docker runs natively on Linux: set `COMPOSE_FILE` as `.github/workflows/ci.yml` does, so every test Postgres uses the host's network. Docker Desktop doesn't need it.

## For coding agents

Agents read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). They follow the same workflow, with the skills those files name.
