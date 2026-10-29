# 09: Prisma and Kysely

**What to build:** Choosing Prisma or Kysely at init produces an install where both stacks' apps use that ORM end to end: schema, migrate step and queries. The platform contract stays `DATABASE_URL`, a schema and a migrate hook.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] A fresh install with each ORM passes the guest journey and `robkit add` for both stacks
- [ ] Each ORM's migrate command runs as the app's pre-start step

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
