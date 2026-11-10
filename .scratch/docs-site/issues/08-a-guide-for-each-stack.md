# 08: Build an app: a guide for each stack

**What to build:** One guide per stack: TanStack Start, React + Hono, React + Express, Next.js and React + Go. Each walks through the app `robkit add` writes on that stack, file by file, then adds one feature: a table, a route that reads and writes it as the viewer, a page that shows it, and a test.

- Each guide starts from the files a new app has and says what each is for.
- The feature is the same in all five, so a reader can compare stacks.
- Each links to the shared pages for the detail, and to the stack's own docs for what isn't robkit's.
- The Go guide covers what differs: Go on the `PATH`, the module in `vendor/robkit/go`, and the Go migrator.

Each page follows "The words" in the [PRD](../PRD.md): written for a person, checked against the code and not only against a repo doc, in the glossary's terms. Build the feature in a real app of each stack before writing its guide, and keep nothing of it in the repo but the guide.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Each of the five guides lists the files `robkit add` writes for its stack, and a test fails when the template gains or loses one
- [ ] Each guide's feature was built in an app of that stack made from this checkout, and the PR's Proof says so for each
- [ ] Every `ts` and `tsx` fence compiles, and the Go samples pass `gofmt`
- [ ] The five guides build the same feature under the same headings
- [ ] The PR's CI `gate` job passes on GitHub
