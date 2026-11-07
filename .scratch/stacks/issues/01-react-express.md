# 01: React + Express

**What to build:** `express` becomes a ready stack. It works like `react-hono`, a React page rendered on the server, with Express 5 as the server instead of Hono. That needs a new adapter, `@robkit/express`. This ticket also sets the pattern the next two follow: what adding a stack touches, and how CI covers each stack.

- **Adapter.** `@robkit/express` gives Express what `@robkit/hono` gives Hono: middleware that runs `@robkit/session`'s request guard. It serves the request with the viewer on `res.locals`, typed, or sends the guard's response (the 302 or the 401 lapse contract). It needs the same published-package shape as `@robkit/hono`: README, `api-report.md`, a `*.test-d.ts`, the guard's conformance cases through `@internal/test-session`'s fake core, an entry in `tooling/eslint/package-graph.js`, the adapter row of the layer rule, and the pack check.
- **Template.** `templates/stacks/express` follows react-hono's shape: a page that says who is asking, records a visit through the install's Drizzle layer, and loads the UI kit's stylesheet. It also has `serve.ts`, `AGENTS.md`, `CLAUDE.md`, a `start` script that migrates and then serves, and only runtime imports in `dependencies`.
- **Choices.** Express drops `comingLater`. Both wizards offer it, and `--stack express` works for init and `robkit add`.
- **Whole-stack test.** An `express` install runs every journey the other stacks run, in the pull-request gate.
- **Production.** The production test serves an Express app over https, either as an install's example or as the app it adds.
- **Docs.** The map gets a line for the decision, create-robkit's README says how to add a stack (the checklist this ticket found), the stack AGENTS.md is written, and changesets are added.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] `@robkit/express` passes the guard's conformance cases and has the published-package shape
- [ ] init `--stack express` and `robkit add --stack express` make a working app, and both wizards offer it
- [ ] The generated app passes the install's lint, typecheck, test, format check and `robkit check`
- [ ] The whole-stack journeys pass for an Express install in the pull-request gate
- [ ] The production test serves an Express app over https
- [ ] create-robkit's README lists what adding a stack takes
- [ ] The PR's CI `gate` job passes on GitHub
