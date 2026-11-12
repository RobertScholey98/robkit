# 66: Committing `vendor/robkit` works on a machine with no Go

**What to build:** `robkit vendor` copies robkit's Go module into `vendor/robkit/go`, whatever stacks the install's apps are on (`copyGoModule` in `packages/create-robkit/src/vendor.ts`). The install's pre-commit hook runs `gofmt -w` over every staged `.go` file, the vendored ones included (`lint-staged.config.js` in the base template). So on a machine with no Go, the commit the deploy guide asks for fails:

```text
✖ Task failed to spawn: gofmt -w
ENOENT
husky - pre-commit script failed (code 1)
```

Found on 2026-11-11, making the robscholey.com install on the TanStack Start stack, in WSL with no Go on the `PATH`. The commit went through once Go was on the `PATH`.

- **The hook leaves `vendor/` alone.** The install's `.prettierignore` already lists `vendor/` as robkit's own files. gofmt has no ignore file, so the lint-staged rule has to skip the folder itself.
- **Decide whether `robkit vendor` copies the Go module into an install with no Go app.** `robkit upgrade` writes `vendor/robkit/go` only when the install has a Go app. `robkit vendor` always does.

**Recommended:** skip `vendor/` in the hook, whatever R says to the second. For the second, copy the module only when an app is on React + Go, as upgrade does, if `robkit add` on that stack can still bring the module into a vendored install. Check that before choosing.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A commit that stages `vendor/robkit/go` passes the pre-commit hook on a machine with no Go, and a test holds it
- [ ] `robkit vendor` copies the Go module only into an install with a Go app, and removes a copy an earlier run left in one with none
- [ ] The changeset names create-robkit, and gives the edit for an install made before this

## Comments

### Triage, 2026-11-12

R passed the triage of tickets 66 to 70 to a council round and to me. The council was Opus 5.5 and Sol 6.1, both at high, on `main` at `8ae537af`. I checked each finding in the code before taking it.

- **The hook skips `vendor/`.** Both reviewers agreed. An owner's own Go files still go through gofmt.
- **`robkit vendor` copies the Go module only into an install with a Go app**, as init and `robkit upgrade` do. Both agreed. Nothing is lost: `robkit add` writes the module when the first Go app arrives in an install that isn't linked (`addApp` in `add.ts`), from what the running robkit carries.
- **A run in an install with no Go app removes a `vendor/robkit/go` an earlier run left** (Opus).
- **The changeset gives the one-line edit for an older install** (Opus). No command rewrites an install's `lint-staged.config.js`.
- Not taken: a new test that vendors with no Go app and then adds one (Sol). `add.test.ts` holds it already, in "writes robkit's Go module to vendor/robkit/go with the first Go app of an install that had none".
