# What does each template ship for coding agents?

Type: grilling
Status: resolved

## Question

Users will often build their apps with a coding agent. Decide what every generated app carries (AGENTS.md, CLAUDE.md, lint rules that enforce the layer rule) so an agent stays inside the kit's seams without being told.

## Answer

R, 2026-10-28: every install ships a root `AGENTS.md` plus one per app, written for that app's stack and the repo's ORM. Each `CLAUDE.md` is one line pointing at its `AGENTS.md`. Lint rules fail when an agent breaks the layer rule or imports across apps.

- For the spec: the layer check must still run when the user didn't pick ESLint at init (Biome or no linter). Either ESLint's boundary rules always ship, or a small `robkit check` enforces the same rules. Decide in the spec.
