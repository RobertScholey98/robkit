# 23: `robkit check` says what it proves

**What to build:** `SECURITY.md` leans on `robkit check` to hold an imported app to the install's layer rule. It reads source text, and the review found a dozen ways an app can reach `@robkit/core` or another app's files that it doesn't see ([review](../research/review-2026-11-09.md), "`robkit check` skips folders" and "compares specifier text only"). Chasing every alias and computed name is a race a source scan can't win, and refusing every computed import would stop honest code, such as loading a language file by name. The check is a lint: it catches an app that breaks the rule by mistake. What holds an app that means harm is its database role, its token's audience, and its own image, which holds only its own files. This ticket closes the one cheap hole and makes the docs say that.

- **Skipped folders.** A relative import into a folder the scan skips (`build`, `dist`, a dot-folder, a symlinked folder) fails, with a message that says to keep source out of them.
- **Honest docs.** `SECURITY.md`'s "What an imported app can and can't do" says `robkit check` catches mistakes and isn't a boundary, names the three things that are, and tells the owner to read an imported app's code. The install's `AGENTS.md` describes the check the same way.

Computed imports, `createRequire`, aliases, tsconfig `paths`, a Vite `resolve.alias`, a `package.json` `imports` entry and a cookie name built from pieces are not chased. List them in the comments, and in `SECURITY.md`, as known ways past the lint.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A relative import into `dist`, a dot-folder or a symlinked folder fails, with a test for each
- [ ] A new install's own apps, on every stack, still pass `robkit check`
- [ ] The new message names the file, the line, the rule and what to do
- [ ] `SECURITY.md` says what the check proves, what the boundaries are, and lists the known ways past it
- [ ] The PR's CI `gate` job passes on GitHub
