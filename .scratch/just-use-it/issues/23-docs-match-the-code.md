# 23: The repo's docs match the code

**What to build:** The repo's own docs say things the code no longer does: two stacks where there are five, addresses in the wrong package, an admin with pages it doesn't have ([review](../research/review-2026-11-09.md), "Docs that have drifted"). Tickets 01 to 22 change the seam again. This ticket is the last pass, so the docs site's builder starts from docs that are right.

- **Fix each drift the review lists**, unless an earlier ticket already rewrote the passage.
- **Rewrite what the seam changed.** `README.md`, `docs/architecture.md`, `SECURITY.md`, `GLOSSARY.md`, the ADRs, `AGENTS.md`, `CONTRIBUTING.md` and each package's README describe the install and an app as they are after milestones 1 to 3: `guarded()` with no arguments, `@robkit/drizzle`, `@robkit/vite`, `serve()`, `robkit-core`, the `__Host-` cookies, and `npm create robkit`.
- **New decisions get ADRs.** One short record each for: the guard knows its own address, `__Host-` cookies and the cross-origin rule, and platform wiring lives in packages. Each links the ticket that made it.
- **The map.** `.scratch/kit/map.md` gets a line for each decision this PRD made, its known gaps are brought up to date, and "Not yet specified" loses what is now specified.
- **Checks that keep it true.** Where a drift could have been caught by a repo check, add the check: the README's package table against `packages/`, and the stacks a doc names against `readyStacks`.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16

**Status:** ready-for-agent

- [ ] Every item under "Docs that have drifted" is fixed or gone
- [ ] Every `ts` fence still compiles under the doc-examples check, with no new `nocheck`
- [ ] The README's package table and every list of stacks are checked against the code
- [ ] Three new ADRs exist and are listed in `docs/adr/README.md`
- [ ] The map's decisions, known gaps and "Not yet specified" are current
- [ ] The PR's CI `gate` job passes on GitHub
