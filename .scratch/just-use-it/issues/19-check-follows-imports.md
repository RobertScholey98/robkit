# 19: `robkit check` follows what an app can import

**What to build:** `robkit check` is the only thing that holds an imported app to the install's layer rule, and `SECURITY.md` leans on it. It compares the text of each import and skips some folders, so an app can reach `@robkit/core` or another app's files in ways it doesn't see ([review](../research/review-2026-11-09.md), "`robkit check` skips folders" and "compares specifier text only").

- **Every file an app can load is checked.** A relative import into a folder the scan skips (`build`, `dist`, a dot-folder, a symlinked folder) fails, or the file it reaches is scanned. Choose one and say why.
- **What can't be read is refused.** An `import()` or `require` whose argument isn't a string literal fails, as does any use of `createRequire`, with a message that says to import by name.
- **Names that hide a target are resolved or refused.** A dependency that is an alias (`npm:`, `workspace:` under another name, `file:`, `link:`), a `package.json` `imports` entry, a tsconfig `paths` entry and a Vite `resolve.alias` each either resolve to what they point at and are checked, or fail when they leave the app. An absolute path or a `file:` specifier fails.
- **The cookie rule.** The rule against reading the session cookie matches the names ticket 02 leaves, and fails on a name built from pieces.
- **Go files.** The same rules where they apply to Go's imports, as far as the current scan of `.go` files goes.
- **Honest about its limits.** `SECURITY.md` says what `robkit check` proves and that it reads source, so reviewing an imported app's code still matters.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Each bypass the review lists has a test that fails before the change and passes after
- [ ] A new install's own apps, on every stack, still pass `robkit check`
- [ ] Each new message names the file, the line, the rule and what to do
- [ ] `SECURITY.md` says what the check proves and what it can't
- [ ] The PR's CI `gate` job passes on GitHub
