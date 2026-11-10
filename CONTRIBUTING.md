# Contributing to robkit

Thanks for helping. This page gets you from a fresh machine to a merged change. The words it uses (install, core, hub, guard, viewer and so on) are defined in [GLOSSARY.md](GLOSSARY.md), and [docs/architecture.md](docs/architecture.md) shows how the pieces fit.

## Prerequisites

- **Node 24.** `.node-version` names it.
- **pnpm 11, through Corepack.** Run `corepack enable` once. The root `package.json` pins the exact pnpm version, and Corepack uses it. A pnpm installed some other way may be the wrong version.
- **Go 1.26 or later**, with `go` and `gofmt` on your `PATH`. The Go module in `go/` is a workspace package, so `pnpm check` runs `go vet` and `go test` on it, and the whole-stack test makes a React + Go install. Get it from [go.dev/dl](https://go.dev/dl/); CI uses the version `.github/workflows/ci.yml` names. In WSL, install it there too.
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

| Command          | What it runs                                                                                                                                            | Needs Docker | Time                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------ |
| `pnpm check`     | Prettier's check, knip, lint, typecheck, and every test that needs no Docker, including a fresh install's hub, admin and core-client tests and its lint | No           | About 70 seconds cold (`--force`), 30 warm |
| `pnpm check:all` | What CI runs: Prettier's check, knip, lint, typecheck and every test, the whole-stack test in Chromium included                                         | Yes          | About five and a half minutes on CI        |

Measured on 2026-11-06, on a Windows 11 machine with 16 threads and Node 24, at commit a49c1c7 (round 3 with ticket 19 merged). Three cold runs of `pnpm check --force` took 68, 66 and 79 seconds, and two warm runs 35 and 28 seconds. A warm run still runs repo-checks' tests, which miss turbo's cache every time. `pnpm check:all` took 5 minutes 25 seconds in [CI run 42158416018](https://github.com/RobertScholey98/robkit/actions/runs/42158416018).

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

## Change a template

The hub, admin, core-client and the example apps aren't packages in this repo. They are template files that create-robkit copies into each install, under `packages/create-robkit/templates/`. [create-robkit's README](packages/create-robkit/README.md#change-a-template) walks through changing one and checking it.

## How work is organised

### Planning

All planning lives in `.scratch/`, as markdown:

- `.scratch/<feature>/PRD.md` says what a feature is for, and `.scratch/<feature>/issues/` holds its tickets, numbered in the order they should be built.
- `.scratch/kit/map.md` is the plan for v0.1: every decision and the ticket that made it. [docs/adr/](docs/adr/README.md) holds a short record of each settled one.

Each ticket has a `**Status:**` line:

| Status            | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| `needs-triage`    | R hasn't looked at it yet                               |
| `needs-info`      | Waiting on R to answer its open questions               |
| `ready-for-agent` | Fully specified; anyone, human or agent, can pick it up |
| `ready-for-human` | R builds this one                                       |
| `wontfix`         | Won't be done                                           |
| `done`            | Finished                                                |

To find work, take the lowest-numbered `ready-for-agent` ticket whose `**Blocked by:**` tickets are all `done`. If the ticket leaves a decision open, or the code contradicts it, ask R in the ticket or the pull request rather than guessing, and record the answer in the ticket and the map.

### Without a ticket

You don't need a ticket to propose a change. Either:

- **Open an issue** on GitHub that says what you want changed and why. R turns it into a ticket.
- **Add a ticket in your pull request.** Write `.scratch/<feature>/issues/<NN>-<what-it-does>.md` with `**Status:** needs-triage`, a sentence on what to build, and acceptance criteria as a checklist. Copy the shape of a ticket nearby. Name it in the pull request's Ticket section. CI accepts a ticket the pull request adds, and R triages it in review.

For a typo or a broken link, a ticket can be a few lines.

### Branches and pull requests

- One branch and one pull request per ticket. Name the branch after the ticket, such as `22-app-slugs-checked-at-start`.
- Open the pull request against `main`, or against the branch it builds on if it stacks on another ticket's.
- Fill in the template, `.github/pull_request_template.md`: the ticket (CI checks that it names the ticket's file under `.scratch/`), what changed and why, how you proved it (the commands you ran and their results), and anything R must decide.
- A change to a published package's `src`, or to create-robkit's `templates` (tests aside), needs a changeset. Run `pnpm changeset`, pick the packages and `patch`, and commit the file it writes.
- A change an owner must do something about names create-robkit in its changeset too, and says what to do, such as "Add `ROBKIT_CORE_URL` to your install's `.env`". That holds for a change in any package, and in any file an install copies. `robkit upgrade` prints create-robkit's changelog between two versions, and a changeset writes only to the changelogs of the packages it names.
- Before 1.0.0, a change that breaks an install is `minor`, never `major`. Every package releases at one version, so one `major` changeset would release 1.0.0, and a repo check fails on it.
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

3. **Write a failing test through the public interface.** In `guard.test.ts`, inside `describe("readAccessRule")`:

   ```ts
   import { readAccessRule } from "@robkit/guard";
   import { isProblem } from "@robkit/input";
   import { expect, it } from "vitest";

   it("refuses a roles rule that names no role", () => {
     expect(isProblem(readAccessRule({ kind: "roles", roles: [] }))).toBe(true);
   });
   ```

   Run the guard's tests and watch it fail:

   ```sh
   pnpm --filter @robkit/guard test
   # FAIL  src/guard.test.ts > readAccessRule > refuses a roles rule that names no role
   ```

4. **Make it pass.** In `readAccessRule`, refuse an empty list. Check the length of what `readRoleIds` returns, not of the raw value: once `isProblem` has ruled out an `InputProblem`, `readRoleIds` gives back `RoleId[]`, the branded type `AccessRule` needs, where the raw array is only `unknown`. Here is the whole function after the change, with its error message shortened. In `guard.ts`, `readRoleIds` and `AccessRule` are in the same file; the example imports them so it compiles on its own.

   ```ts
   import { readRoleIds, type AccessRule } from "@robkit/guard";
   import {
     isProblem,
     isRecord,
     problem,
     type InputProblem,
   } from "@robkit/input";

   /** Reads an access rule sent as JSON, or says what is wrong with it. */
   export function readAccessRule(value: unknown): AccessRule | InputProblem {
     const wrong = problem(`${JSON.stringify(value)} isn't an access rule.`);
     if (!isRecord(value)) return wrong;
     const { kind } = value;
     if (kind === "open" || kind === "owner") return { kind };
     const roles = readRoleIds(value.roles);
     return kind === "roles" && !isProblem(roles) && roles.length > 0
       ? { kind, roles }
       : wrong;
   }
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

## Releasing

R releases. A release publishes `create-robkit` and every `@robkit/*` package to npm at one new version, and tags it `v<version>`. It takes two steps: a pull request that changes the versions, then a button that publishes them.

The first release, 0.1.0, waits for [ticket 19](.scratch/just-use-it/issues/19-robkit-upgrade.md) (`robkit upgrade`) to merge. 0.1.0's half of `robkit upgrade` can't change once it is on npm.

### Set up once

1. On [npmjs.com](https://www.npmjs.com), sign in, open your avatar's menu and choose **Add Organization**. Name it `robkit` and choose the free plan. The `@robkit` scope is now yours. `create-robkit` has no scope, so it needs nothing.
2. Open your avatar's menu, then **Access Tokens**, then **Generate New Token**, then **Granular Access Token**. Name it `robkit release`. Give it read and write access to all packages and to the `robkit` organization. Allow it to publish without two-factor authentication, since a workflow can't answer the prompt. Generate it and copy it.
3. On GitHub, open robkit's **Settings**, then **Environments**, then **New environment**. Name it `release` and choose **Configure environment**.
4. Under **Deployment branches and tags**, choose **Selected branches and tags**, then **Add deployment branch or tag rule**, and enter `main`.
5. Tick **Required reviewers**, add yourself, and choose **Save protection rules**.
6. Under **Environment secrets**, choose **Add environment secret**. Name it `NPM_TOKEN`, paste the token, and choose **Add secret**.

### Release a version

1. Get main up to date in your clone:

   ```sh
   git switch main
   git pull
   ```

2. See what the release holds. This lists each package and the version it goes to:

   ```sh
   pnpm changeset status --verbose
   ```

3. Open the version pull request. It cuts a branch, runs `changeset version`, commits, pushes and opens the pull request with `gh`, then prints its address:

   ```sh
   pnpm release:version
   ```

4. Open the pull request. Read each `CHANGELOG.md` it changes, above all create-robkit's: an owner reads that one. CI's `gate` job runs the dry run on it.
5. When `gate` passes, merge the pull request.
6. Optionally, run the dry run yourself, in Linux or WSL. It builds and packs every package as the publish will, prints each one's version and tarball, and makes no call to npm:

   ```sh
   git pull
   pnpm release:dry-run
   ```

7. On GitHub, open **Actions**, then **Release**, then **Run workflow**. Leave **Use workflow from** on `main` and choose **Run workflow**.
8. The `gate` job runs the full gate. Then the `publish` job waits for you: open the run, choose **Review deployments**, tick `release` and choose **Approve and deploy**.
9. When the run is green, every package is on npm and GitHub has the tag. Check the tag:

   ```sh
   git fetch --tags
   git tag --list "v*"
   ```

### If the release stops

Run it again: **Actions**, **Release**, **Run workflow** from `main`. It publishes only the packages npm lacks at this version, so it carries on from where it stopped, then tags.

- If the publish step says `NPM_TOKEN is missing`, the `release` environment has no token. Nothing was published. Add it as step 6 of [Set up once](#set-up-once) says, then run the release again.
- If npm refuses a version because it is already published, npm hadn't listed it yet when the run asked. Wait five minutes, then run the release again.
- If you started it from a branch other than `main`, it stopped before it did anything. Run it again from `main`.

### Check the release

In an empty folder outside any robkit checkout, make an install from npm and start it:

```sh
npm create robkit@latest my-install -- --stack start
cd my-install
pnpm install
pnpm dev
```

Then open <http://hub.robkit.localhost:3000>. On npmjs.com, each package's page shows the new version, with a **Provenance** section that links to the run that published it.

### Move to trusted publishing

npm's trusted publishing lets the workflow publish with no token. npm offers it only for a package that already exists, so the first release uses the token. After it:

1. On npmjs.com, open each of the 15 packages, then **Settings**, then **Trusted Publisher**, then **GitHub Actions**. Enter the owner `RobertScholey98`, the repository `robkit`, the workflow `release.yml` and the environment `release`, and save.
2. Open a pull request that takes out the token: delete the `NPM_TOKEN` check from `tooling/repo-checks/src/release-publish.ts` and the `NPM_TOKEN` line from `.github/workflows/release.yml`, and change `tooling/repo-checks/src/release-workflow.test.ts` to match. The publish job keeps `id-token: write`, which trusted publishing uses.
3. Once it merges and a release has published without the token, delete `NPM_TOKEN` from the `release` environment, and delete the token on npmjs.com.

## When a test fails

Rerun it alone before you change code: `pnpm --filter <package> exec vitest run <file>`. Under load, a test can fail for reasons that aren't the code.

[docs/testing.md](docs/testing.md#when-a-test-fails) says what each suite prints when it fails, how to save the whole-stack test's screenshots, and how to clear containers a crashed run left behind.

## Troubleshooting

| What you see                                                                                                                        | Why                                                                                           | What to do                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On Windows, `pnpm` isn't found, `pnpm --version` doesn't print the version `packageManager` names, or `corepack enable` can't write | Another pnpm comes first on `PATH`, or Corepack can't write its shims to Node's folder        | Let Corepack write them to a folder you own, and put that folder first on `PATH`: `corepack enable --install-directory <folder> pnpm`. Then `pnpm --version` prints the pinned version. |
| "This version of pnpm requires at least Node.js v22.13", then "No such built-in module: node:sqlite"                                | The shell runs an older Node, often nvm's default in a new WSL shell                          | `nvm use 24` and `nvm alias default 24`. `node --version` should print v24.                                                                                                             |
| In WSL, Docker can't pull an image, naming `docker-credential-desktop.exe`                                                          | Docker Desktop's credential helper doesn't run inside WSL                                     | Point Docker at an empty config, as step 5 of [On Windows, use WSL](#on-windows-use-wsl) shows.                                                                                         |
| The whole-stack test's pages fail with `ERR_NETWORK_CHANGED`                                                                        | Docker runs natively on Linux, and each test Postgres's network adds host interfaces mid-test | Set `COMPOSE_FILE` as `.github/workflows/ci.yml` does. [docs/testing.md](docs/testing.md#tests-that-start-docker) says why. Docker Desktop doesn't need it.                             |
| A test times out in `pnpm check` but passes alone                                                                                   | The machine was busy                                                                          | Rerun it alone. If it fails alone too, it's real.                                                                                                                                       |
| CI's ratchet says to raise a coverage threshold you just set                                                                        | Your machine measures coverage a little differently from CI                                   | Set it to the number CI names. The `check` job's `coverage` artifact has CI's reports.                                                                                                  |
| The commit-msg hook refuses your commit                                                                                             | The subject breaks a rule in [Commits](#commits)                                              | Reword it. The message names the rule.                                                                                                                                                  |
| CI's pull-request job says the Ticket section names no file                                                                         | The pull request body doesn't name a ticket under `.scratch/`                                 | Name the ticket's file, or add a `needs-triage` ticket as [Without a ticket](#without-a-ticket) says. Edit the body. The job reads it again each time it runs.                          |
| A lint rule or repo check refuses your change, and its message isn't enough                                                         | Each rule and check has a longer note                                                         | Look it up in [tooling/eslint/README.md](tooling/eslint/README.md) or [tooling/repo-checks/README.md](tooling/repo-checks/README.md).                                                   |

## For coding agents

Agents read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). They follow the same workflow, with the skills those files name.
