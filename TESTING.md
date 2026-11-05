# Testing app sharing: approach A, export bundles

Your acceptance test from the app-sharing PRD, as commands to paste. `pnpm dev` needs Linux, so everything runs in WSL (`Ubuntu-22.04`). Open the URLs in your Windows browser.

The same test runs on its own as `tooling/e2e/src/sharing.test.ts`, in the whole-stack test.

## 1. Get this worktree into WSL

In PowerShell:

```powershell
wsl -d Ubuntu-22.04
```

Then in WSL:

```sh
nvm use 24
rsync -a --delete --exclude node_modules --exclude .turbo --exclude dist --exclude .git \
  /mnt/c/Users/rober/.t3/worktrees/robkit/share-a-export/ ~/robkit-a/
cd ~/robkit-a
pnpm install --frozen-lockfile
```

If you've run this test before, remove the old installs and their databases first. This keeps the guestbook:

```sh
for dir in ~/robkit-demo-a/install-a ~/robkit-demo-a/install-b; do
  [ -d "$dir" ] && (cd "$dir" && docker compose down -v)
done
rm -rf ~/robkit-demo-a/install-a ~/robkit-demo-a/install-b ~/robkit-demo-a/notes
```

## 2. Create install A and import the guestbook

The guestbook is an app in its own git repo at `~/robkit-demo-a/guestbook`, outside any install. Its source is `examples/guestbook` in this worktree. If the copy in WSL is missing, this makes it again:

```sh
if [ ! -d ~/robkit-demo-a/guestbook ]; then
  mkdir -p ~/robkit-demo-a
  cp -r ~/robkit-a/examples/guestbook ~/robkit-demo-a/guestbook
  git -C ~/robkit-demo-a/guestbook init -q
  git -C ~/robkit-demo-a/guestbook add -A
  git -C ~/robkit-demo-a/guestbook commit -qm "Guestbook"
fi
```

Create install A and import the guestbook:

```sh
cd ~/robkit-a
pnpm create-install ~/robkit-demo-a/install-a --stack start
cd ~/robkit-demo-a/install-a
pnpm robkit import ~/robkit-demo-a/guestbook
```

Import says it uses the install's own `@internal/theme`, `@internal/tsconfig` and `@internal/ui`: the guestbook's `shared/` copies matched install A's, so it dropped them.

Each install's database is its own, even beside approach B's installs of the same names: init names its Docker project after its folder, with a random suffix, in `compose.yaml`.

## 3. Add an app and change it

Add `notes`, open to anyone. Change its page, add a table to its schema with a migration, and give it a seed. A `seed.sql` at the app's root is its seed.

```sh
pnpm robkit add notes --stack start --access open --icon 📝
cd apps/notes
sed -i 's/Signed in as/Hello from install A. Signed in as/' src/routes/index.tsx
cat >> src/schema.ts <<'EOF'

/** A note anyone can read. */
export const note = pgTable("note", {
  id: serial().primaryKey(),
  body: text().notNull(),
});
EOF
pnpm db:generate --name notes
echo "insert into note (body) values ('Seeded in install A');" > seed.sql
```

`drizzle-kit` writes `drizzle/0001_notes.sql`.

## 4. Run install A

```sh
cd ~/robkit-demo-a/install-a
pnpm dev
```

It prints `[guestbook] ran seed.sql once, on its new schema`, and the same for notes.

1. Open http://hub.robkit.localhost:3000 and claim the install: pick a username and password.
2. The launcher shows guestbook 📖 and notes 📝. Open guestbook: Rob and Grandma signed it. That's its seed.
3. Open notes: it says "Hello from install A. Signed in as the owner".

Press Ctrl-C to stop install A. Install B also uses port 3000.

## 5. Export notes and import it into install B

```sh
cd ~/robkit-demo-a/install-a
pnpm robkit export notes
cd ~/robkit-a
pnpm create-install ~/robkit-demo-a/install-b --stack start
cd ~/robkit-demo-a/install-b
pnpm robkit import ~/robkit-demo-a/notes
pnpm dev
```

Export writes `~/robkit-demo-a/notes`, a git repo of its own, and commits it. It holds notes' files and, in `shared/`, a copy of install A's UI kit, theme and tsconfig, so it installs, lints, typechecks and tests on its own. Import maps them back onto install B's own.

`pnpm dev` prints `[notes] ran seed.sql once, on its new schema`: install B made notes' table and seeded it.

Install B is new, so its cookies mean nothing to install A's. Use a new private window:

1. Open http://hub.robkit.localhost:3000 and claim install B.
2. Sign out, then sign in as a guest with the code `test`.
3. Open notes 📝 from the launcher. It says "Hello from install A. Signed in as a guest".

Press Ctrl-C to stop install B.

## 6. Change notes in both installs, then update install B

Install B's owner changes the button on notes' page. Install A changes its greeting and exports again. Then install B updates notes:

```sh
cd ~/robkit-demo-a/install-b
sed -i 's/Visit again/Count me again/' apps/notes/src/routes/index.tsx
cd ~/robkit-demo-a/install-a
sed -i 's/Hello from install A/Hello again from install A/' apps/notes/src/routes/index.tsx
pnpm robkit export notes
cd ~/robkit-demo-a/install-b
pnpm robkit update notes
pnpm dev
```

Update says it updated `apps/notes`, keeping your own edits. It merged install A's change with install B's, as git merges a branch. This time `pnpm dev` doesn't run the seed: the schema and its data stay.

Reload notes in the private window, or sign in as a guest again if you closed it. Notes says "Hello again from install A. Signed in as a guest", and its button says "Count me again".

## If something goes wrong

- If Docker can't pull Postgres because of Docker Desktop's credential helper, run `mkdir -p ~/.docker-empty && echo '{}' > ~/.docker-empty/config.json && export DOCKER_CONFIG=~/.docker-empty`, then try again.
- If port 3000 is taken, stop the other install, or run `ROBKIT_DEV_PORT=3100 pnpm dev` and use port 3100 in the URLs.
- If Postgres can't start because port 54320 is taken, another install's `pnpm dev` is still running. Stop it first.
