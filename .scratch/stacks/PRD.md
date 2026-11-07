# More stacks: Next.js, React + Express, React + Go

## Problem

`robkit add` makes apps on two stacks, TanStack Start and React + Hono. init's wizard lists three more as "coming later": Next.js, React + Express and React + Go. The map deferred them until v0.1 proved the adapter seam. It has, and R wants all three built (2026-11-05).

## Outcome

Each of the three stacks is as real as `start` and `react-hono`:

- `npm create robkit -- --stack <stack>` makes the example app on it, and `robkit add --stack <stack>` adds one. Both wizards offer it.
- The app runs under `pnpm dev`, guarded by the install's session. A guest, the owner and a role each see what the guard allows. A lapsed session goes back to sign-in and returns to the page.
- The app passes the install's `lint`, `typecheck`, `test`, `format:check` and `robkit check`.
- The app builds into a production image with the install's Dockerfile and serves over https in the production test.
- CI checks every stack on every pull request.

## Decisions

R's answers on 2026-11-07:

- **React + Go owns its database.** It uses pgx and plain SQL migrations, which the Go binary runs as `migrate`. It ignores the install's TypeScript ORM layer.
- **The Go session module is `github.com/RobertScholey98/robkit/go`.** It lives in this repo's `go/` folder. Until publishing (v0.1 ticket 31), installs reach it with a `replace` directive: to the checkout with `--link`, and to `vendor/robkit/go` after `robkit vendor`.
- **CI grows.** Every stack's whole-stack journeys run on every pull request.
- **One ticket, branch and PR per stack, stacked.** R merges.

Each ticket's other choices are made in the build and noted under its `## Comments` as "chosen in the build, awaiting R's review", as v0.1 did.

## Tickets

1. [React + Express](issues/01-react-express.md)
2. [Next.js](issues/02-next.md)
3. [React + Go](issues/03-react-go.md)

## Out of scope

- Publishing anything to npm or a Go proxy. R hasn't decided yet (v0.1 ticket 31).
- Running `pnpm dev` on native Windows (WSL works).
- Sharing apps between installs (`.scratch/app-sharing/`). Its approaches must not care about the stack, so they need nothing from these tickets.
