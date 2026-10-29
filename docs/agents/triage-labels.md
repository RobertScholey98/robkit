# Triage labels

The skills speak in terms of five triage roles. This table maps them to the strings on each ticket's `**Status:**` line.

| Role in mattpocock/skills | Status in this repo | Meaning                                                   |
| ------------------------- | ------------------- | --------------------------------------------------------- |
| `needs-triage`            | `needs-triage`      | R needs to evaluate this ticket                           |
| `needs-info`              | `needs-info`        | Waiting on R to answer the ticket's open questions        |
| `ready-for-agent`         | `ready-for-agent`   | Fully specified, ready for an agent with no extra context |
| `ready-for-human`         | `ready-for-human`   | R implements this one                                     |
| `wontfix`                 | `wontfix`           | Will not be done                                          |

Finished build tickets are marked `done`. The plan's own tickets in `.scratch/kit/issues/` use `resolved` and `closed (out of scope)` instead.
