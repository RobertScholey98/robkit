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

**Status:** ready-for-agent

- [ ] Every `Profile` value is named `profile`, including in core's JSON
- [ ] The glossary separates the three meanings of session, and core's store file is `session-store.ts`
- [ ] `routes/access-codes.ts`, alike command entry files and intent-named Coolify helpers
- [ ] The PR's CI `gate` job passes on GitHub
