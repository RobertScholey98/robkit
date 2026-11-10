# 20: The repo's docs match the code

**What to build:** The repo's own docs say things the code no longer does: two stacks where there are five, addresses in the wrong package, an admin with pages it doesn't have ([review](../research/review-2026-11-09.md), "Docs that have drifted"). Tickets 01 to 19 change the seam again, and each updates the docs it touches. This ticket is the pass over what is left, so the docs site's builder starts from docs that are right. Milestone 4's tickets keep their own docs current after it.

- **Fix each drift the review lists**, unless an earlier ticket already rewrote the passage.
- **Read every doc against the code.** `README.md`, `docs/architecture.md`, `SECURITY.md`, `GLOSSARY.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, each package's README, and the templates' `AGENTS.md` and README describe the install and an app as they are after milestones 1 to 3. Where two say different things, one is fixed. The PR's Proof lists each doc read, with what changed in it or that nothing did.
- **Where the tickets are.** `AGENTS.md` and `CLAUDE.md` send a reader to `.scratch/v0.1-build/issues/` for the build tickets. This work's are in `.scratch/just-use-it/issues/`. Both files name both, and say which is current. `CLAUDE.md` is R's, so change only that pointer and say so in the PR.
- **An ADR is a record.** Don't rewrite one. Where milestones 1 to 3 changed a decision an ADR holds, write a new record that supersedes it and mark the old one superseded, as `docs/adr/README.md` says.
- **New decisions get ADRs.** One short record each for: the guard knows its own address; the boundary between sibling subdomains (`__Host-` cookies, the cross-origin rule, the framing headers); platform wiring lives in packages; provisioning as its own package; robkit's Go module travels in the install (13); one version for every package, released by a pull request and a button (14); the runner takes requests on a socket file (18); and upgrade's two steps, with the handover that can't change (19). Each links the ticket that made it.
- **The pin rule is the repo's.** robkit's own packages pin exact versions. An install's catalog is the owner's. Check no doc gives the repo's rule as an install's.
- **The glossary.** Add the words this work brought in, if any stuck, and fix the two entries the review names.
- **The map.** `.scratch/kit/map.md` gets a line for each decision this PRD made, its known gaps are brought up to date, and "Not yet specified" loses what is now specified.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19

**Status:** done

- [x] Every item under "Docs that have drifted" is fixed or gone
- [x] Every `ts` fence still compiles under the doc-examples check, with no new `nocheck`
- [x] The README's package table lists every folder under `packages/`, and every doc that sets out to list the stacks lists all five
- [x] Eight new ADRs exist and are listed in `docs/adr/README.md`, and no existing ADR's decision was rewritten
- [x] `AGENTS.md` and `CLAUDE.md` point at `.scratch/just-use-it/issues/`
- [x] The PR's Proof lists each doc read, with what changed in it
- [x] The map's decisions, known gaps and "Not yet specified" are current
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **`packages/` has 15 folders now.** Four are new: `provision`, `drizzle`, `vite` and `serve`.
- **The "platform wiring lives in packages" ADR** covers `@robkit/drizzle`, `@robkit/vite`, `@robkit/serve`, each adapter's `/serve` and `/testing` entries, and `robkit-core`. PRD decision 11 has the three placements weighed for provisioning, for its own ADR.
- **Milestone 2's code round changed three things the docs describe**, each already written into the package's README: `guardedAs()` serves only in a test run, `@robkit/serve` follows a link inside a served folder, and a failed `onStopped` exits 1 with its own line. Check that no other doc says the old thing.

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Neither had a must-change here. I checked each point against the code and took these:

- **`AGENTS.md` and `CLAUDE.md` point at the old tickets** (Opus). Line 6 of the first and line 8 of the second name `.scratch/v0.1-build/issues/` alone.
- **ADRs are superseded, not rewritten** (Sol). The ticket listed the ADRs among the docs to bring up to date, which reads as leave to edit them.
- **Milestone 3's decisions get records too** (Opus). I added the four a newcomer would question. init installing and an app's `.env` are in the map and need no record.
- **The Proof lists what was read** (Sol), and "every doc that lists stacks" means one that sets out to list them all (Sol).

### From the build, 2026-11-10

**What I chose:**

- **No record is superseded.** Milestones 1 to 3 changed facts in five records, not their decisions. So each got a dated note under the passage, with the record's own words left as they were: 0007 (provisioning and `slugProblem` moved), 0009 (five stacks, and what a new stack needs), 0011 (four adapters, the cross-origin and framing checks, `/serve` and `/testing`), 0012 (the sign-in limit isn't soft since ticket 04) and 0013 (the Go module travels in the install). `docs/adr/README.md` now says how a dated note works.
- **The eight records are 0014 to 0021.** Each status says which PRD decision and ticket made it, and that the build's choices await R's review. 0019 says accepted, because R answered its questions in v0.1 ticket 31.
- **Reasons come from the tickets and the PRD.** Where a ticket gave none, the record says what was chosen and doesn't invent one. 0016's "a fix reached only installs made after it" follows from ADR 0008, not from a ticket's words.
- **`CLAUDE.md`**: only line 8 changed, the pointer to the tickets.
- **The pull request template** asks for `pnpm check:all`, which CI's `gate` runs. It asked for a command that skipped the format check and knip.
- **The glossary** gained App's origin, Slug, Runner, Provision step and Linked install.
- **The map**: removed two gaps that tickets 04 and 33 closed, added seven, and said native Windows waits on ticket 21. Its destination now names the five stacks.
- **Left alone**: react-hono's `AGENTS.md` says "a `app.get`". A template change needs a changeset, and that typo isn't worth one on its own.

**For the docs site's builder.** The best source for each subject:

| Subject                              | Start from                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| What robkit is, and the quickstart   | `README.md`                                                                   |
| Words                                | `GLOSSARY.md`                                                                 |
| How a request and a token flow       | `docs/architecture.md`                                                        |
| What robkit protects, and its gaps   | `SECURITY.md`                                                                 |
| Why it is built this way             | `docs/adr/`, then `.scratch/kit/map.md`                                       |
| An install, from the owner's side    | `templates/base/README.md` and `AGENTS.md` in `packages/create-robkit`        |
| Building an app on one stack         | `templates/stacks/<stack>/AGENTS.md`, and the adapter's README                |
| Deploying                            | `templates/base/docs/deploy.md`                                               |
| Upgrading                            | the install's README, "Upgrade robkit", and ADR 0021                          |
| Each package's API                   | its README and `api-report.md`                                                |
| Contributing, releasing              | `CONTRIBUTING.md`, `docs/testing.md`, and the READMEs in `tooling/`           |

Gaps no doc covers:

- Nothing is on npm. Every doc that says `npm create robkit` describes what will work after R's first release. The site should say so until then.
- A walk-through for a person building a first app. The stack `AGENTS.md` files cover it, but they are written for a coding agent.
- Backups, observability and secret rotation for a running install. The map lists them as not yet specified.
- Native Windows. Docs say to use WSL, and `pnpm dev` runs there. Native Windows waits on ticket 21.
- The Go version. `CONTRIBUTING.md` and the install's docs say Go 1.26 or later, `go.mod` says 1.26.0, and CI runs 1.27.3. Ticket 25 owns that.

### Merged

Added by the lead. PR 99 merged into `m3-making-an-install` on 2026-11-10 as `8f83804a`, with `gate`, `check` and `pull-request` green on `bf852788`.

I read the whole diff and checked ten of its claims against the code: what `pnpm check` runs, which packages keep a `*.test-d.ts`, where `Report`, the addresses and `isDomain` live, the three repo checks its README gained, and the test name `CONTRIBUTING.md` filters on. Each held.

The code round's fixes landed after the build wrote records 0020 and 0021, so I brought both up to the code as it merged, in commits of their own. Neither had reached `main`, so I changed their text and added no dated note. I did the same for `packages/dev/README.md`, create-robkit's README, `docs/conventions/errors.md`, and one line each in the install's `README.md` and `AGENTS.md`.
