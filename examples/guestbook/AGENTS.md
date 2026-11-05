# Guestbook

A robkit app: a guestbook anyone can read and anyone signed in can sign. It is a React app on a Hono server, the React + Hono stack, and it lives in its own repo outside any install. `pnpm robkit import <this folder>` brings it into an install.

- `src/server.tsx` is the Hono server. `guarded` from `@robkit/hono` runs first and hands each handler the viewer as `c.var.viewer`. Never read the session cookie or verify the token yourself, and give no route a path under `/_robkit/`.
- `src/schema.ts` declares the `entry` table, and `drizzle/` holds its migrations. After changing the schema, run `pnpm db:generate` and commit the new migration.
- `seed.sql` runs once, as the app's own role, when an install first makes the app's schema.
- `src/entry.ts` checks a signature, and `src/entry.test.ts` tests it.
