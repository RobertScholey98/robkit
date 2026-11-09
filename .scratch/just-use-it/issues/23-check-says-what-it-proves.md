# 23: `robkit check` says what it proves

**What to build:** `SECURITY.md` leans on `robkit check` to hold an imported app to the install's layer rule. It reads source text, and the review found a dozen ways an app can reach `@robkit/core` or another app's files that it doesn't see ([review](../research/review-2026-11-09.md), "`robkit check` skips folders" and "compares specifier text only"). Chasing every alias and computed name is a race a source scan can't win. The check is a lint: it catches an app that breaks the rule by mistake. What holds an app that means harm is its database role, its token's audience, and its own image, which holds only its own files. This ticket closes the cheap holes and makes the docs say that.

- **Skipped folders.** A relative import into a folder the scan skips (`build`, `dist`, a dot-folder, a symlinked folder) fails, with a message that says to keep source out of them.
- **What can't be read is refused.** An `import()` or `require` whose argument isn't a string literal fails, as does any use of `createRequire`, with a message that says to import by name.
- **The cookie rule follows the names.** The rule against reading the session cookie matches the names ticket 03 leaves.
- **Honest docs.** `SECURITY.md`'s "What an imported app can and can't do" says `robkit check` catches mistakes and isn't a boundary, names the three things that are, and tells the owner to read an imported app's code. The install's `AGENTS.md` describes the check the same way.

Aliases, tsconfig `paths`, a Vite `resolve.alias`, a `package.json` `imports` entry and a cookie name built from pieces are not chased. List them in the comments as known ways past the lint.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A relative import into `dist`, a dot-folder or a symlinked folder fails, with a test for each
- [ ] A computed `import()`, a computed `require` and `createRequire` each fail, with a test for each
- [ ] The cookie rule matches both of ticket 03's names
- [ ] A new install's own apps, on every stack, still pass `robkit check`
- [ ] Each new message names the file, the line, the rule and what to do
- [ ] `SECURITY.md` says what the check proves and what the boundaries are
- [ ] The PR's CI `gate` job passes on GitHub
