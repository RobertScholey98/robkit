# 17: Names that match the glossary

**What to build:** Every name for a domain thing matches the glossary, and files that do the same job are named alike.

The round-2 reviewers found these:
- Core's `GET /session` answer and the hub template call a `Profile` a `viewer`.
- `routes/codes.ts` serves access codes.
- "session" means three things: the token, the state cookie and core's row. The glossary has one entry for all of them.
- `packages/core/src/sessions.ts` stores sessions.
- The three command entry files are named differently: `robkit.ts`, `bin.ts` and dev's.
- The Coolify API helpers have names that don't say what they do.

Raises rubric categories 4 (naming) and 6 (consistency). Evidence: `../research/council-r2-opus.md` section 4; `../research/council-r2-sol.md` section 4; `../research/council-r2-sonnet.md` section 4.

- **Profile.** A value of type `Profile` is called `profile` everywhere, including in core's `GET /session` JSON, the hub template's `core-api.ts` and `launcher.tsx`, and their tests. Keep `viewer` for the guard's `Viewer` and `SignedInViewer`. The JSON field rename is an intended contract change, so record it in the changeset.
- **Glossary entries for session.** `GLOSSARY.md` gets separate entries for session token, session state and session (core's row), each with what to avoid. Rename `packages/core/src/sessions.ts` to `session-store.ts`.
- **Access codes.** Rename `routes/codes.ts` to `routes/access-codes.ts`.
- **Command entry files.** Give `create-robkit`'s and `robkit`'s entry files names that read alike, for example `create-robkit-command.ts` and `robkit-command.ts`, and match dev's. Update `package.json` `bin` paths and the docs that name them.
- **Coolify helpers.** Name each helper in `packages/create-robkit/src/coolify-api.ts` for its intent.
- **Commits.** Each rename is its own commit, apart from any behaviour change. Add changesets.

You own `GLOSSARY.md` this round. List doc edits for ticket 18 under Comments.

**Blocked by:** 13

**Status:** done

- [x] Every `Profile` value is named `profile`, including in core's JSON
- [x] The glossary separates the three meanings of session, and core's store file is `session-store.ts`
- [x] `routes/access-codes.ts`, alike command entry files and intent-named Coolify helpers
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose, and why**

- **Profile.** Core's `GET /session`, `POST /setup`, `POST /login` and `POST /login/code` now answer `{ state: "signed-in", profile }`. Inside core, a session's holder and `SignedIn` say `profile` too. The hub template reads `profile`, and the launcher's props are `profile`. `viewer` is left for the guard's `Viewer`, `SignedInViewer` and the adapters' `c.var.viewer` / `context.viewer`. Changeset: `.changeset/profile-not-viewer.md` calls out the HTTP contract change. Admin doesn't read `/session`, so it didn't change.
- **Session entries.** `GLOSSARY.md` has **Session** (core's row in `core.sessions`), **Session token** (unchanged) and a new **Session state** (the guard's `SessionState`). Each has avoid words: "login session, auth session" and "auth state, login state". The ticket didn't name them. I chose words nothing in the repo uses today, because avoiding bare "session" or "cookie" would fail the check on correct uses. Two flagged ambiguities record the session split and the `viewer`/`profile` rename. The ticket's "state cookie" is `robkit_state`, the guard's refresh `state`, which isn't a session; I gave it no entry.
- **Access codes.** `routes/codes.ts` is `routes/access-codes.ts`, and its function is `accessCodeRoutes`. Its tests, `codes.db.test.ts`, moved to `access-codes.db.test.ts` to match.
- **Command entry files.** All three are named `<command>-command.ts`: `create-robkit-command.ts`, `robkit-command.ts` and dev's `robkit-dev-command.ts`. Their tests moved with them. The `bin` and `publishConfig.bin` paths, the root `create-install` script, and `manifest.test.ts`'s fixture point at the new names. Changeset: `.changeset/command-entry-names.md`.
- **Coolify helpers.** I renamed them with TypeScript's rename service, not by hand: `call` → `callCoolify`, `get` → `readFromCoolify`, `field` → `fieldOf`, `text` → `stringFieldOf`, `explain` → `describeFailure`, `duration` → `describeDuration`, `checks` → `whatToCheck`, `checkFor` → `checkForStatus`, `Api` → `CoolifyApi`, `Called` → `CoolifyAnswer`. `Coolify` keeps its name because `env.ts` imports it and it already says what it is.
- **Commits.** Each rename is its own commit. The JSON change is the one behaviour commit, and its tests went red first: in WSL, six core tests failed on `viewer`; five hub `core-api` tests failed too.

**Proof**

- `pnpm check`: 44 of 44 tasks pass.
- WSL with Docker, `pnpm --filter @robkit/core --filter @robkit/dev test`: core 239 tests, dev 75, all pass, with coverage thresholds.
- I ran the hub template's `core-api.test.ts` with a throwaway Vitest config that aliased `@internal/core-client`: 21 pass.

**What I couldn't verify**

- I didn't typecheck the hub template locally; it only typechecks inside a generated install. CI's whole-stack test covers it.
- I didn't run e2e locally. CI runs it.

**Doc edits for ticket 18**

- `docs/architecture.md:171`: `packages/core/src/sessions.ts` → `packages/core/src/session-store.ts`.
- `packages/create-robkit/README.md:17`: `src/bin.ts` → `src/create-robkit-command.ts`.
- No README or doc names `routes/codes.ts`, `robkit.ts`, dev's `bin.ts` or the Coolify helper names, so nothing else needs to change.

**For ticket 19**

- Core's `sessions.ts` is now `session-store.ts`. Extract its pure functions from there.
