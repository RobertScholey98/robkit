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

**Status:** needs-triage

- [ ] A commit that stages `vendor/robkit/go` passes the pre-commit hook on a machine with no Go, and a test holds it
- [ ] R has said whether `robkit vendor` copies the Go module into an install with no Go app
- [ ] The changeset names create-robkit
