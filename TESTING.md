# Testing approach B: apps as git repos

Every step runs in WSL (Ubuntu-22.04), because `pnpm dev` needs Linux. Open a WSL terminal with `wsl -d Ubuntu-22.04` and paste each block as it comes. Only the browser runs on Windows.

`tooling/e2e/src/share.test.ts` runs the same steps as a test: `corepack pnpm --filter @internal/e2e test:share`.

## 1. Bring this worktree into WSL

```sh
source ~/.nvm/nvm.sh && nvm use 24
pnpm() { corepack pnpm "$@"; }
rsync -a --delete --exclude node_modules --exclude .turbo --exclude dist --exclude .git \
  /mnt/c/Users/rober/.t3/worktrees/robkit/share-b-app-repos/ ~/robkit-b/
cd ~/robkit-b && pnpm install
```

Run the first two lines again in every new terminal.

## 2. Make install A and give it the sample app

The sample is a guestbook in its own git repo, outside any install, at `~/robkit-demo-b/guestbook`. These commands make it again from `examples/guestbook`, then make install A.

```sh
mkdir -p ~/robkit-demo-b && rm -rf ~/robkit-demo-b/guestbook
cp -r ~/robkit-b/examples/guestbook ~/robkit-demo-b/guestbook
cd ~/robkit-demo-b/guestbook && git init -q -b main && git add . && git commit -qm "Guestbook"
cd ~/robkit-b && pnpm create-install ~/robkit-demo-b/install-a --stack react-hono
cd ~/robkit-demo-b/install-a && pnpm robkit install ../guestbook
```

## 3. Add an app to A, and change its page and its schema

`notes` is a Start app. The edits change the heading a guest sees, add a `note` table with its migration, and add a seed that writes one note.

```sh
cd ~/robkit-demo-b/install-a
pnpm robkit add notes --stack start --access open --icon 🗒️
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
git status --short
```

`pnpm db:generate` runs `drizzle-kit generate`, which writes `drizzle/0001_<name>.sql`. `git status` runs in the app's own repo.

## 4. Run A

```sh
cd ~/robkit-demo-b/install-a && COMPOSE_PROJECT_NAME=robkit-b-a pnpm dev
```

`COMPOSE_PROJECT_NAME` keeps this install's Postgres apart from approach A's installs, which would otherwise share a project named after the folder.

1. Open http://hub.robkit.localhost:3000 and claim the install with any username and password.
2. In a private window, open http://hub.robkit.localhost:3000 and sign in with the code `test`, which works only under `pnpm dev`.
3. The launcher shows guestbook and notes. guestbook lists the seed's two messages. notes says "Notes from install A".

Stop it with Ctrl-C. Both installs use port 3000, so only one runs at a time.

## 5. Share notes

```sh
cd ~/robkit-demo-b/install-a
pnpm robkit share notes
git add robkit.json && git commit -qm "Share notes"
```

With no target, `share` makes a bare repo at `~/robkit-demo-b/robkit-apps/notes.git`.

## 6. Make install B and install notes into it

```sh
cd ~/robkit-b && pnpm create-install ~/robkit-demo-b/install-b --stack start
cd ~/robkit-demo-b/install-b && pnpm robkit install ../robkit-apps/notes.git
COMPOSE_PROJECT_NAME=robkit-b-b pnpm dev
```

1. Claim install B at http://hub.robkit.localhost:3000. The browser keeps A's cookies for these hosts, so use a new private window, or sign out of A's hub first.
2. As a guest with the code `test`, open notes from the launcher. It says "Notes from install A".
3. The seed is there. In a second WSL terminal:

```sh
docker compose -p robkit-b-b exec postgres psql -U postgres -d robkit -c 'select body from notes.note'
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
git -C apps/notes log --oneline
COMPOSE_PROJECT_NAME=robkit-b-b pnpm dev
```

`update` commits B's edit in the app's repo, then merges A's share into it. As a guest, notes now says "Notes from install A, shared again" above "Your id in install B:". The `psql` line in step 6 still shows one note: the seed ran once. Stop it with Ctrl-C.

## 8. What it refuses

```sh
cd ~/robkit-demo-b/install-b
pnpm robkit install ../robkit-apps/notes.git
pnpm robkit install ../robkit-apps/notes.git --as admin
cd ~/robkit-demo-b/guestbook && sed -i 's/"contract": 1/"contract": 2/' package.json && git commit -qam "Contract 2"
cd ~/robkit-demo-b/install-b && pnpm robkit install ../guestbook
cd ~/robkit-demo-b/guestbook && git reset -q --hard HEAD~1
```

The first says `apps/notes` already exists and suggests `--as` or `update`. The second says admin is one of the platform apps. The third says the guestbook was made for contract 2, which this install's robkit can't run. The last line puts the guestbook back.

## Start over

```sh
cd ~/robkit-demo-b/install-a && docker compose -p robkit-b-a down -v
cd ~/robkit-demo-b/install-b && docker compose -p robkit-b-b down -v
rm -rf ~/robkit-demo-b/install-a ~/robkit-demo-b/install-b ~/robkit-demo-b/robkit-apps
```
