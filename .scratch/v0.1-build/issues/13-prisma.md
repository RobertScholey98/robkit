# 13: Prisma

**What to build:** Choosing Prisma at init produces an install where both stacks' apps use Prisma end to end: schema, migrate step and queries. The platform contract stays `DATABASE_URL`, a schema and a migrate hook, and core keeps Drizzle internally.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] A fresh install with Prisma passes the guest journey and `robkit add` for both stacks
- [ ] Prisma's migrate command runs as the app's pre-start step locally and as its pre-deploy step, following ticket 11's notes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
