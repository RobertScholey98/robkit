# 05: Guests sign in with codes

**What to build:** Admin (React, plain JSX + Tailwind) runs at `admin.robkit.localhost`, open to the owner only. There the owner mints and revokes access codes. A guest signs in at the hub with a code, or with an intro link that carries it, and sees the launcher. Until roles land in 06, a guest can open only apps open to anyone, and every other app answers them with the generic 404.

**Blocked by:** 04

**Status:** done

- [x] A guest opening admin gets the generic 404
- [x] An intro link signs the guest in without typing the code
- [x] Revoking a code ends its sessions at the next refresh
- [x] The seeded `test` code is refused unless `ROBKIT_DOMAIN` ends in `.localhost`
- [x] The CI journey adds a guest signing in with a code
- [x] An expired code is refused, and its sessions end at the next refresh

## Decisions

- **Codes are stored as plain text (R, 2026-11-01).** Admin lists every code and can copy its intro link at any time, as in robnet.
- **Codes have an optional expiry (R, 2026-11-01).** The mint form takes an optional date. An expired code is refused at sign-in, and its sessions end at the next refresh, the same way as a revoked code.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 06 onwards. R hasn't reviewed the choices marked "chosen in the build" yet.

- **Data.** `core.access_codes` holds `code` (plain text, and a CHECK keeps it to 3 to 32 upper-case letters or digits), `name` (the guest's name), `expires_at` and `revoked_at`. A session holds the owner or a code, never both. Migration 0001 seeds `TEST`.
- **One rule for whether a code works.** `standingOf` in `packages/core/src/access-codes.ts` answers live, revoked, expired or local-only. Sign-in, `/session` and `/refresh` all ask it, so a dead code ends its sessions at the next refresh. Ticket 06 can hang a code's roles off the same read.
- **Token (chosen in the build).** Claims are `{ kind: "owner" | "guest", id, sessionId }`. A guest's `id` is the code's uuid, never the code, because apps see the viewer id. Ticket 06 adds roles to this payload.
- **Guard.** `conformance.json` has a guest column: an open app allows a guest, and an owner-only app answers not found. Ticket 06 adds the role-gated rule.
- **Core's code routes.** `POST /login/code` takes `{ code }` and answers 401 "That code doesn't work." for any dead code. It has its own limiter (10 failures per 15 minutes per client), and a good code doesn't reset it. The owner-only `GET /codes`, `POST /codes` and `POST /codes/:id/revoke` answer 404 to anyone else.
- **Admin (chosen in the build).** `apps/admin` has the example app's shape: a Hono server with `guarded({ access: owner })` serves the page, so a guest gets the adapter's real 404, and the React client calls core with credentials. Core's address reaches the page in a `<meta name="robkit-core">` tag. Its `ui.tsx` copies the hub's until a UI kit lands (ticket 15).
- **Hub.** The sign-in screen leads with the code, and the owner's form sits behind a link. An intro link is `hub.<domain>/i/<code>`: the hub takes the code out of the address bar and signs in. In dev, React StrictMode sends that sign-in twice, which leaves one extra session.
- **Expiry (chosen in the build).** Admin's field is "Last day", and a code works to the end of that day in the owner's timezone.
- **Tests on Windows.** Same as 04: e2e, the runner tests, `repo-checks` and one `migrate.test.ts` case need Linux or macOS. The whole suite passes in WSL Ubuntu 22.04.
