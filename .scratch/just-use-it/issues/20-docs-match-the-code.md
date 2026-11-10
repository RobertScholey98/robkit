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

**Status:** ready-for-agent

- [ ] Every item under "Docs that have drifted" is fixed or gone
- [ ] Every `ts` fence still compiles under the doc-examples check, with no new `nocheck`
- [ ] The README's package table lists every folder under `packages/`, and every doc that sets out to list the stacks lists all five
- [ ] Eight new ADRs exist and are listed in `docs/adr/README.md`, and no existing ADR's decision was rewritten
- [ ] `AGENTS.md` and `CLAUDE.md` point at `.scratch/just-use-it/issues/`
- [ ] The PR's Proof lists each doc read, with what changed in it
- [ ] The map's decisions, known gaps and "Not yet specified" are current
- [ ] The PR's CI `gate` job passes on GitHub

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
