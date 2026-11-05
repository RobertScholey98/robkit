# Testing approach B: apps as git repos

Every step runs in WSL (Ubuntu-22.04), because `pnpm dev` needs Linux. Only the browser runs on Windows. Open a WSL terminal with `wsl -d Ubuntu-22.04`, run `nvm use 24` in it, then paste each block as it comes.

`tooling/e2e/src/share.test.ts` runs the same steps as a test: `pnpm --filter @internal/e2e test:share`.

## 1. Bring this worktree into WSL

```sh
rsync -a --delete --exclude node_modules --exclude .turbo --exclude dist --exclude .git \
  /mnt/c/Users/rober/.t3/worktrees/robkit/share-b-app-repos/ ~/robkit-b/
cd ~/robkit-b && pnpm install
```

## 2. Make install A and give it the sample app

The sample is a guestbook in its own git repo, outside any install, ready at `~/robkit-demo-b/guestbook`. To make it again, see the end.

```sh
cd ~/robkit-b && pnpm create-install ~/robkit-demo-b/install-a --stack react-hono
cd ~/robkit-demo-b/install-a && pnpm robkit install ../guestbook
```

## 3. Add an app to A, and change its page and its schema

`notes` is a Start app. The edits change the heading a guest sees, add a `note` table with its migration, and add a seed that writes one note.

```sh
pnpm robkit add notes --stack start --access open --icon 🗒️ --description "Notes that travel between installs."
cd apps/notes
sed -i 's/return "Signed in as a guest";/return "Notes from install A";/' src/routes/index.tsx
cat >> src/schema.ts <<'EOF'

/** A note install A seeds. */
export const note = pgTable("note", {
  id: serial().primaryKey(),
  body: text().notNull(),
});
EOF
pnpm db:generate
echo "insert into note (body) values ('Seeded in install A');" > seed.sql
```

`pnpm db:generate` runs `drizzle-kit generate`, which writes the migration `drizzle/0001_<name>.sql`.

## 4. Run A

```sh
cd ~/robkit-demo-b/install-a && pnpm dev
```

1. Open http://hub.robkit.localhost:3000 and claim the install with any username and password.
2. In a private window, open http://hub.robkit.localhost:3000 and sign in with the code `test`, which works only under `pnpm dev`.
3. The launcher shows guestbook and notes. guestbook lists the seed's two messages. notes says "Notes from install A".

Stop it with Ctrl-C. Both installs use port 3000, so only one runs at a time.

## 5. Share notes

```sh
pnpm robkit share notes
```

With no target, `share` makes a bare repo at `~/robkit-demo-b/robkit-apps/notes.git`, and prints the command another install takes it with.

## 6. Make install B and install notes into it

```sh
cd ~/robkit-b && pnpm create-install ~/robkit-demo-b/install-b --stack start
cd ~/robkit-demo-b/install-b && pnpm robkit install ../robkit-apps/notes.git
pnpm dev
```

1. Claim install B at http://hub.robkit.localhost:3000. The browser keeps A's cookies for these hosts, so use a new private window, or sign out of A's hub first.
2. As a guest with the code `test`, open notes from the launcher. It says "Notes from install A".
3. The seed ran. In a second WSL terminal, this prints the one row `Seeded in install A`:

```sh
cd ~/robkit-demo-b/install-b && docker compose exec postgres psql -U postgres -d robkit -c 'select body from notes.note'
```

Stop `pnpm dev` with Ctrl-C.

## 7. Change notes in A again, and update B

A changes the heading again and shares. B changes another line of the same page, then updates.

```sh
cd ~/robkit-demo-b/install-a
sed -i 's/return "Notes from install A";/return "Notes from install A, shared again";/' apps/notes/src/routes/index.tsx
pnpm robkit share notes
cd ~/robkit-demo-b/install-b
sed -i 's/Viewer id:/Your id in install B:/' apps/notes/src/routes/index.tsx
pnpm robkit update notes
pnpm dev
```

`update` commits B's edit in the app's repo, then merges A's share into it. As a guest, notes now says "Notes from install A, shared again" above "Your id in install B:". The `psql` line in step 6 still prints one row: the seed ran once. Stop it with Ctrl-C.

What `install` and `update` refuse (a taken slug, a platform app's slug, a contract this install can't run) is covered by `packages/create-robkit/src/app-repo.test.ts`.

## Start over

```sh
cd ~/robkit-demo-b/install-a && docker compose down -v
cd ~/robkit-demo-b/install-b && docker compose down -v
rm -rf ~/robkit-demo-b/install-a ~/robkit-demo-b/install-b ~/robkit-demo-b/robkit-apps
```

Each install has its own Compose project, named in its `compose.yaml`, so `docker compose` in its folder reaches its Postgres and no other.

To make the sample's repo again, from this worktree's `examples/guestbook`:

```sh
rm -rf ~/robkit-demo-b/guestbook && cp -r ~/robkit-b/examples/guestbook ~/robkit-demo-b/guestbook
cd ~/robkit-demo-b/guestbook && git init -q -b main && git add . && git commit -qm "Guestbook"
```
