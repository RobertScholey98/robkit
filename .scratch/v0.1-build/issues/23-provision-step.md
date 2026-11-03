# 23: Provisioning is its own step

**What to build:** Giving each app with a database its schema and role, then running its `migrate` script, becomes a step that runs on its own, outside `pnpm dev`. `pnpm dev` calls the step and then starts the apps as before. Ticket 10 needs this as its provision step, and ticket 11 runs it before a deploy. The step can be tested against Postgres without starting the proxy or any app.

**Blocked by:** 22

**Status:** ready-for-agent

- [ ] Running the step twice on the same install changes nothing the second time, and a test proves it without starting any app
- [ ] An app's `migrate` runs after its schema and role exist, and before the app starts
- [ ] `pnpm dev` behaves as before, and the whole-stack test passes
- [ ] Role passwords work as today: a fresh one each run, handed to the app as `DATABASE_URL`. Where they come from in production stays ticket 10's open question

Source: the architecture review of 2026-11-03 (see the map)
