# Contributing to robkit

Thanks for helping. This page gets you from a fresh machine to a merged change. The words it uses (install, core, hub, guard, viewer and so on) are defined in [GLOSSARY.md](GLOSSARY.md), and [docs/architecture.md](docs/architecture.md) shows how the pieces fit.

## Prerequisites

- **Node 24.** `.node-version` names it.
- **pnpm 11, through Corepack.** Run `corepack enable` once. The root `package.json` pins the exact pnpm version, and Corepack uses it. A pnpm installed some other way may be the wrong version.
- **Docker**, with Compose. Core's and the dev runner's `*.db.test.ts` files, the test Postgres's tests and the whole-stack test start their own Postgres containers.
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

`pnpm install` also sets up two git hooks. Before each commit, ESLint fixes and Prettier formats the files you staged. The commit-msg hook checks your subject line (see [Commits](#commits)).

To try a change the way a user would, make an install linked to your checkout:

```sh
pnpm create-install ../my-install --stack start   # or with no arguments, and it asks
cd ../my-install
pnpm dev                                          # then open http://hub.robkit.localhost:3000
```

The install uses your checkout's `@robkit/*` packages, so a change in `packages/` shows up there.

## Check your work

There are two gates.

| Command          | What it runs                                                                                              | Needs Docker | Time                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| `pnpm check`     | Prettier's check, lint, typecheck, and every test that needs no Docker                                    | No           | 53 to 65 seconds cold (`--force`), 25 to 34 warm, on Windows |
| `pnpm check:all` | What CI runs: Prettier's check, lint, typecheck and every test, the whole-stack test in Chromium included | Yes          | About four minutes                                           |

Run `pnpm check` while you work and `pnpm check:all` before you open a pull request. The whole-stack test needs Chromium once: `pnpm --filter @internal/e2e exec playwright install --with-deps chromium`.

The production test is separate. It builds each app's Docker image and runs the journey over https, and takes about nine minutes. CI runs it on every push to `main`, every night, and on a pull request labelled `production`. To run it yourself:

```sh
pnpm --filter @internal/e2e test:production
```

Other commands:

```sh
pnpm format                                       # format everything with Prettier
pnpm turbo run lint typecheck                     # lint and typecheck every package
pnpm changeset                                    # say which published packages a change touches
pnpm --filter @internal/repo-checks api:update    # rewrite the API reports after an intended API change
```

### Run one package's tests

```sh
pnpm --filter @robkit/guard test                                  # one package
pnpm --filter @robkit/guard exec vitest run src/guard.test.ts     # one file
pnpm --filter @robkit/hono test -- -t "conformance"               # tests whose name matches
```

Every test in `@internal/e2e` and `@internal/test-postgres` needs Docker and Linux, and so do core's and dev's `*.db.test.ts` files. The rest run anywhere, core's and dev's other tests included, and `pnpm check` runs them.

A package's `test` script measures coverage and fails below the thresholds in its `vitest.config`. When your change raises coverage, raise the thresholds with it, to what CI measures. CI fails a pull request that lowers one, and fails a threshold more than 2 points under what CI measured, naming the number to set. The `check` job's `coverage` artifact has CI's reports.

### What each check does

When a check refuses your change, its message says what to do. For more:

- [tooling/eslint/README.md](tooling/eslint/README.md): each lint rule, its message and what to do about it, and how to add a layer rule row or a package graph edge.
- [tooling/repo-checks/README.md](tooling/repo-checks/README.md): each repo check and CI script, what it fails on, how to fix it, and where an exception goes.

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
- Fill in the template, `.github/pull_request_template.md`: the ticket (CI checks that it names the ticket's file under `.scratch/`), what changed and why, how you proved it (the commands you ran and their results), and anything R must decide.
- A change to a published package's `src`, or to create-robkit's `templates` (tests aside), needs a changeset. Run `pnpm changeset`, pick the packages and `patch`, and commit the file it writes.
- CI's `gate` job passes only when every other job does. It is the one check a pull request needs.
- R reviews and merges. Don't merge your own.

### Commits

R reviews commit by commit, so keep each one small and about one thing.

- One logical change per commit. A test goes in the same commit as the behaviour it covers.
- Refactors, renames and formatting get their own commits, apart from behaviour changes.
- Write the subject in the imperative, in 72 characters at most: "Add a README to each package", not "Added READMEs". Use the body to say why when the diff doesn't show it. The commit-msg hook, and CI on every commit of a pull request, refuse a subject over 72 characters, one ending in a period, one starting with a lowercase letter, or one whose first word ends in "ed" or "ing".
- If the subject needs an "and", split the commit.

### Writing

Write docs, tickets, commit messages and pull requests in short, plain sentences, with the answer before the detail. Use the glossary's words: "core" and "hub", never "backend" and "frontend"; "role", never "grant". A repo check (`tooling/repo-checks/src/glossary.ts`) fails on a word the glossary avoids, in the docs, the package READMEs and the packages' `src`. Where the word is right, such as another tool's name for something, add an exception there with the reason.

## A first change, from ticket to pull request

Say a ticket asks that an access rule gated to roles must name at least one. Today `readAccessRule` accepts `{ "kind": "roles", "roles": [] }`, which quietly makes an app owner-only. Here is the whole loop.

1. **Read the ticket and the code it names.** `readAccessRule` is in `packages/guard/src/guard.ts`, and its tests are in `guard.test.ts` beside it. Core, admin and `requestGuard` all read rules through it.

2. **Branch.**

   ```sh
   git switch -c 43-roles-rule-names-a-role main
   ```

3. **Write a failing test through the public interface.** Add the empty list to the values `readAccessRule` refuses, in `guard.test.ts`:

   ```ts nocheck
   { kind: "roles", roles: [] },
   ```

   Run the guard's tests and watch it fail:

   ```sh
   pnpm --filter @robkit/guard test
   # FAIL  src/guard.test.ts > readAccessRule > refuses {"kind":"roles","roles":[]}
   ```

4. **Make it pass.** In `readAccessRule`, require at least one role:

   ```ts nocheck
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

6. **Add a changeset.** The change is in a published package's source, so run `pnpm changeset`, pick `@robkit/guard` and `patch`, describe the change in a sentence, and commit the file it writes.

7. **Run the gates.** `pnpm check`, then `pnpm check:all`.

8. **Finish the ticket.** Tick its acceptance criteria, set `**Status:** done`, and add a `## Comments` section at the bottom with what you chose, how you proved it, and anything the next ticket needs. Commit that on its own.

9. **Push and open the pull request.**

   ```sh
   git push -u origin 43-roles-rule-names-a-role
   gh pr create --base main
   ```

## When a test fails

Rerun it alone before you change code: `pnpm --filter <package> exec vitest run <file>`. Under load, a test can fail for reasons that aren't the code.

[docs/testing.md](docs/testing.md#when-a-test-fails) says what each suite prints when it fails, how to save the whole-stack test's screenshots, and how to clear containers a crashed run left behind.

## For coding agents

Agents read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). They follow the same workflow, with the skills those files name.
