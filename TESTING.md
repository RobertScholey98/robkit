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
corepack pnpm install --frozen-lockfile
```

If you've run this test before, clear out the old installs first. This keeps the guestbook:

```sh
for dir in ~/robkit-demo-a/install-a ~/robkit-demo-a/install-b; do
  [ -d "$dir" ] && (cd "$dir" && docker compose down -v)
done
rm -rf ~/robkit-demo-a/install-a ~/robkit-demo-a/install-b ~/robkit-demo-a/notes
```

## 2. Create install A

```sh
cd ~/robkit-a
corepack pnpm create-install ~/robkit-demo-a/install-a --stack start
echo COMPOSE_PROJECT_NAME=robkit-demo-a-install-a > ~/robkit-demo-a/install-a/.env
```

The `.env` line names the install's Docker project. Docker otherwise names it after the folder, so another `install-a` folder, such as approach B's, would share its database.

## 3. Import the guestbook

The guestbook is an app in its own git repo at `~/robkit-demo-a/guestbook`, outside any install. Its source is `examples/guestbook` in this worktree. If the copy in WSL is missing, this makes it again:

```sh
if [ ! -d ~/robkit-demo-a/guestbook ]; then
  cp -r ~/robkit-a/examples/guestbook ~/robkit-demo-a/guestbook
  cd ~/robkit-demo-a/guestbook
  git init -q && git add -A && git commit -qm "Guestbook"
fi
```

Import it:

```sh
cd ~/robkit-demo-a/install-a
corepack pnpm robkit import ~/robkit-demo-a/guestbook
```

It says it uses the install's own `@internal/theme`, `@internal/tsconfig` and `@internal/ui`: the guestbook's `shared/` copies matched install A's, so the import dropped them.

## 4. Add an app and change it

Add `notes`, open to anyone:

```sh
cd ~/robkit-demo-a/install-a
corepack pnpm robkit add notes --stack start --access open --icon 📝
```

Change its page, add a table to its schema with a migration, and give it a seed:

```sh
cd ~/robkit-demo-a/install-a/apps/notes
sed -i 's/Signed in as/Hello from install A. Signed in as/' src/routes/index.tsx
cat >> src/schema.ts <<'EOF'

/** A note anyone can read. */
export const note = pgTable("note", {
  id: serial().primaryKey(),
  body: text().notNull(),
});
EOF
corepack pnpm db:generate --name notes
echo "insert into note (body) values ('Seeded in install A');" > seed.sql
npm pkg set robkit.seed=seed.sql
```

`drizzle-kit` writes `drizzle/0001_notes.sql`. `robkit.seed` in `package.json` names the seed.

## 5. Run install A

```sh
cd ~/robkit-demo-a/install-a
corepack pnpm dev
```

1. Open http://hub.robkit.localhost:3000 and claim the install: pick a username and password.
2. The launcher shows guestbook 📖 and notes 📝. Open guestbook: Rob and Grandma signed it. That's its seed, which ran once as `pnpm dev` made its schema.
3. Open notes: it says "Hello from install A. Signed in as the owner".

Press Ctrl-C to stop install A. Install B also uses port 3000.

## 6. Export notes

```sh
cd ~/robkit-demo-a/install-a
corepack pnpm robkit export notes
```

It writes `~/robkit-demo-a/notes`, a git repo of its own, and commits it. Have a look:

```sh
cd ~/robkit-demo-a/notes
ls -a . shared
git log --oneline
```

`shared/` holds install A's `packages/ui`, `packages/theme` and `tooling/typescript`. The repo stands alone:

```sh
cd ~/robkit-demo-a/notes
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

## 7. Create install B and import notes

```sh
cd ~/robkit-a
corepack pnpm create-install ~/robkit-demo-a/install-b --stack start
echo COMPOSE_PROJECT_NAME=robkit-demo-a-install-b > ~/robkit-demo-a/install-b/.env
cd ~/robkit-demo-a/install-b
corepack pnpm robkit import ~/robkit-demo-a/notes
corepack pnpm dev
```

Install B is new, so its cookies mean nothing to install A's and the other way round. Use a new private window to keep them apart:

1. Open http://hub.robkit.localhost:3000 and claim install B.
2. Sign out, then sign in as a guest with the code `test`.
3. Open notes 📝 from the launcher. It says "Hello from install A. Signed in as a guest".

The new table and its seed are there. In a second WSL terminal:

```sh
cd ~/robkit-demo-a/install-b
docker compose exec postgres psql -U postgres robkit -c 'select * from notes.note'
```

It shows `Seeded in install A`. Press Ctrl-C in the first terminal to stop install B.

## 8. Export again and update

Change notes in install A and export again. The same repo gets a second commit:

```sh
cd ~/robkit-demo-a/install-a/apps/notes
sed -i 's/Hello from install A/Hello again from install A/' src/routes/index.tsx
cd ~/robkit-demo-a/install-a
corepack pnpm robkit export notes
git -C ~/robkit-demo-a/notes log --oneline
```

Importing it into install B again says how to update:

```sh
cd ~/robkit-demo-a/install-b
corepack pnpm robkit import ~/robkit-demo-a/notes || true
```

Update it as it says. Its schema and data stay, and the seed doesn't run again:

```sh
cd ~/robkit-demo-a/install-b
rm -rf apps/notes
corepack pnpm robkit import ~/robkit-demo-a/notes
```

The next `corepack pnpm dev` in install B shows "Hello again from install A".

## If something goes wrong

- If Docker can't pull Postgres because of Docker Desktop's credential helper, run `mkdir -p ~/.docker-empty && echo '{}' > ~/.docker-empty/config.json && export DOCKER_CONFIG=~/.docker-empty`, then try again.
- If port 3000 is taken, stop the other install, or run `ROBKIT_DEV_PORT=3100 corepack pnpm dev` and use port 3100 in the URLs.
