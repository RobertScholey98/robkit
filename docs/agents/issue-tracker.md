# Issue tracker: local markdown

Tickets and plans for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- `.scratch/kit/` is the v0.1 plan. `map.md` lists the decisions, and `issues/` holds the research and grilling tickets that made them.
- `.scratch/v0.1-build/issues/` holds the build tickets as `<NN>-<slug>.md`, numbered from `01` in build order.
- A new feature's PRD goes in `.scratch/<feature-slug>/PRD.md`, and its tickets in `.scratch/<feature-slug>/issues/`.
- Each build ticket records its triage state on a `**Status:**` line near the top (see `triage-labels.md`) and its dependencies on a `**Blocked by:**` line.
- Comments and follow-up notes go at the bottom of the file under a `## Comments` heading.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/issues/`, creating the directory if needed, numbered after the last ticket there.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. R will normally pass the path or the ticket number.
