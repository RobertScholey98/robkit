# 02: The local stack runs

**What to build:** On a developer machine, `pnpm dev` starts Postgres (Compose), core (Hono) and the hub (React, plain JSX + Tailwind) behind a dev proxy on `:3000` that routes `*.localhost`. Opening `hub.localhost` shows a hub page that has reached core. Core is the only process that touches the core schema, through its own role, and its migrate step runs before it starts.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] One command starts Postgres, core and the hub, and stops them all on exit
- [ ] The proxy routes `hub.localhost` and core's routes to each process's port
- [ ] Core's tables live in their own schema reached through a role that can touch nothing else
- [ ] Core migrates as a separate step before it starts, never at boot

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
