# 20: The repo's docs match the code

**What to build:** The repo's own docs say things the code no longer does: two stacks where there are five, addresses in the wrong package, an admin with pages it doesn't have ([review](../research/review-2026-11-09.md), "Docs that have drifted"). Tickets 01 to 19 change the seam again, and each updates the docs it touches. This ticket is the pass over what is left, so the docs site's builder starts from docs that are right. Milestone 4's tickets keep their own docs current after it.

- **Fix each drift the review lists**, unless an earlier ticket already rewrote the passage.
- **Read every doc against the code.** `README.md`, `docs/architecture.md`, `SECURITY.md`, `GLOSSARY.md`, the ADRs, `AGENTS.md`, `CONTRIBUTING.md`, each package's README, and the templates' `AGENTS.md` and README describe the install and an app as they are after milestones 1 to 3. Where two say different things, one is fixed.
- **New decisions get ADRs.** One short record each for: the guard knows its own address; the boundary between sibling subdomains (`__Host-` cookies, the cross-origin rule, the framing headers); platform wiring lives in packages; and provisioning as its own package. Each links the ticket that made it.
- **The glossary.** Add the words this work brought in, if any stuck, and fix the two entries the review names.
- **The map.** `.scratch/kit/map.md` gets a line for each decision this PRD made, its known gaps are brought up to date, and "Not yet specified" loses what is now specified.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19

**Status:** ready-for-agent

- [ ] Every item under "Docs that have drifted" is fixed or gone
- [ ] Every `ts` fence still compiles under the doc-examples check, with no new `nocheck`
- [ ] The README's package table lists every folder under `packages/`, and every doc that lists stacks lists all five
- [ ] Four new ADRs exist and are listed in `docs/adr/README.md`
- [ ] The map's decisions, known gaps and "Not yet specified" are current
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **`packages/` has 15 folders now.** Four are new: `provision`, `drizzle`, `vite` and `serve`.
- **The "platform wiring lives in packages" ADR** covers `@robkit/drizzle`, `@robkit/vite`, `@robkit/serve`, each adapter's `/serve` and `/testing` entries, and `robkit-core`. PRD decision 11 has the three placements weighed for provisioning, for its own ADR.
- **Milestone 2's code round changed three things the docs describe**, each already written into the package's README: `guardedAs()` serves only in a test run, `@robkit/serve` follows a link inside a served folder, and a failed `onStopped` exits 1 with its own line. Check that no other doc says the old thing.
