<!-- Written by robkit export. robkit import leaves it out. -->

# Guestbook

A guestbook anyone can read and anyone signed in can sign.

A robkit app on the react-hono stack, made for robkit contract 1. It was exported from a robkit install with `pnpm robkit export guestbook`.

## Import it

From an install's root:

```sh
pnpm robkit import <this repo's folder or git URL>
```

`--as <slug>` gives it another name. The next `pnpm dev` gives it its own schema, runs its migrations and, on a new schema, its seed (`seed.sql`).

## Work on it here

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

It runs only inside an install, which gives it its database, its sign-in and its subdomain, so `pnpm dev` here doesn't start it. Import it into an install to run it.

`shared/` holds the install code it uses: `@internal/ui`, `@internal/tsconfig`, `@internal/theme`. robkit import maps each folder back onto the install's own package where they're the same, and keeps it in the app where they differ.
