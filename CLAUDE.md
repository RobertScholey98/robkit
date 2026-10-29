# robkit

robkit is a self-hosting kit shared with the community. `npm create robkit` scaffolds a monorepo with core, the hub, admin and one Postgres. `robkit add` drops in apps that already have auth, a database schema and a subdomain.

## Where things are

- `.scratch/kit/map.md` is the plan. It lists every decision and links the ticket that made it.
- `.scratch/v0.1-build/issues/` holds the build tickets, numbered in build order.
- The spec is the Claude Doc "robkit v0.1 spec" (https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5). Where a ticket and the spec disagree, the ticket is newer and wins.
- `GLOSSARY.md` holds the domain terms. Until ticket 01 creates it, read `.scratch/kit/issues/03-domain-glossary.md`.
- `AGENTS.md` holds robkit's layer rule and the repo's commands, once ticket 01 creates it.
- `.skills/` holds copies of every skill this file names, with their licences.

## How to work

This repo follows Matt Pocock's skills workflow.

1. Take the lowest-numbered build ticket whose status is `ready-for-agent` and whose blockers are all `done`. Work on one branch per ticket and open one PR per ticket.
2. Build it with `/tdd`. Write a failing test through a public interface, make it pass, then refactor. Every acceptance criterion ends up covered by a test.
3. For a bug or a test failure you don't understand, use `/diagnose`. Reproduce it before you change code.
4. If the ticket leaves a decision open, or the code contradicts it, stop and ask R with `/grill-with-docs`: one question at a time, each with your recommended answer. Record the answer in the ticket and in the map. Don't guess. A ticket marked `needs-info` waits until R answers its open questions.
5. When the ticket is finished, tick its acceptance criteria, set its status to `done`, and note anything the next ticket needs under a `## Comments` heading at the bottom of the file.

To plan new work, use `/to-prd` and then `/to-issues`. Use `/triage` to move tickets between states, `/prototype` to answer a design question with throwaway code, and `/improve-codebase-architecture` when a module gets hard to test.

## Commits

R reviews commit by commit, so keep each commit small and about one thing.

- One logical change per commit. A test goes in the same commit as the behaviour it covers.
- Refactors, renames and formatting get their own commits, separate from behaviour changes.
- Write the subject in the imperative, under about 60 characters. Use the body to say why when the diff doesn't show it.
- If the subject needs an "and", split the commit.

## Talking to R

Run `/unslop` on everything R reads: chat replies, questions, PR descriptions, commit messages and ticket text. Keep it short and plain, and give the answer before the detail.

## Agent skills

### Issue tracker

Tickets live as markdown files under `.scratch/<feature>/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default role strings, plus `done` for finished build tickets. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, with the glossary in `GLOSSARY.md` and decisions in the map's tickets. See `docs/agents/domain.md`.
