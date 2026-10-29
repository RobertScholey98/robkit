# Domain docs

How the engineering skills should read this repo's domain documentation before exploring the code.

## Before exploring, read these

- `GLOSSARY.md` at the repo root holds the domain terms. The Matt Pocock skills call this file `CONTEXT.md`; in this repo, read `GLOSSARY.md` wherever a skill says `CONTEXT.md`. Until build ticket 01 creates it, the terms are in `.scratch/kit/issues/03-domain-glossary.md`.
- `.scratch/kit/map.md` and the tickets it links hold the architectural decisions. This repo has no `docs/adr/` yet; read the map wherever a skill says ADRs.
- `AGENTS.md` holds robkit's layer rule once ticket 01 creates it.

If one of these files doesn't exist yet, carry on without it.

## Use the glossary's vocabulary

When your output names a domain concept (in a ticket title, a refactor proposal, a hypothesis or a test name), use the term as the glossary defines it. Write "hub" and "core", never "frontend" and "backend"; write "role", never "grant".

If the concept you need isn't in the glossary, either you're inventing language the project doesn't use, or there's a real gap. Raise a gap with R through `/grill-with-docs`.

## Flag conflicts with decisions

If your work contradicts a decision in the map, say so explicitly instead of overriding it:

> Contradicts the map's database decision (one schema and role per app), but worth reopening because…
