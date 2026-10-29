# Skills

The agent skills that `CLAUDE.md` and `docs/agents/` refer to, copied here so anyone working on robkit has the same workflow.

| Skill | What it's for | Source |
| --- | --- | --- |
| `tdd` | Build each ticket test first | Matt Pocock |
| `diagnose` | Reproduce and fix a bug | Matt Pocock |
| `grill-with-docs` | Settle an open decision with R, one question at a time | Matt Pocock |
| `to-prd` | Write a PRD for new work | Matt Pocock |
| `to-issues` | Split a plan into tickets | Matt Pocock |
| `triage` | Move tickets between states | Matt Pocock |
| `prototype` | Answer a design question with throwaway code | Matt Pocock |
| `improve-codebase-architecture` | Find modules worth deepening | Matt Pocock |
| `setup-matt-pocock-skills` | Configure the skills above for a repo. Only a person runs it. robkit's answers are already in `docs/agents/` | Matt Pocock |
| `unslop` | Remove AI writing patterns from anything R reads | poteto |

## Sources and licences

- Matt Pocock's skills come from https://github.com/mattpocock/skills under the MIT licence in `licenses/mattpocock-skills.txt`.
- `unslop` is a local adaptation of a skill from https://github.com/poteto/plugins, under the MIT licence in `licenses/poteto-pstack.txt`. This copy drops one line that pointed at a Codex-only runtime guide.

These copies may carry local edits and may lag upstream.

## Using them

Claude Code loads project skills from `.claude/skills/`, not from this folder. To use these copies, link that folder here, or install the skills globally from their sources.
