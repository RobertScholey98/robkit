# 13: Prisma

**What to build:** Choosing Prisma at init produces an install where both stacks' apps use Prisma end to end: schema, migrate step and queries. The platform contract stays `DATABASE_URL`, a schema and a migrate hook, and core keeps Drizzle internally.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] A fresh install with Prisma passes the guest journey and `robkit add` for both stacks
- [ ] Prisma's migrate command runs as the app's pre-start step locally and as its pre-deploy step, following ticket 11's notes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished ticket 08, which was deleted once done:

- `robkit.json` records `orm: "drizzle"`, but there is no Drizzle layer. Core keeps Drizzle inside `@robkit/core`, and the example apps query Postgres with `postgres` directly. Put the example apps on Drizzle first, so Prisma has something to replace.

Notes from ticket 12:

- **The app's AGENTS.md.** Each app's `AGENTS.md` ends with the ORM's section, `templates/orms/<orm>/AGENTS.md`, which the choice table names as the option's `appGuide`. Write `orms/prisma/AGENTS.md` on reading and migrating with Prisma, and the stack sections stay as they are. Drizzle's section describes today's apps, which query with `postgres`; when the example apps move to Drizzle, rewrite it too.
