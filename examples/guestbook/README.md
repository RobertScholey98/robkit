# Guestbook

A sample robkit app that lives in its own repo, outside any install. Visitors leave a name and a message. It runs on the React + Hono stack, and `seed.sql` writes the first two messages the first time an install makes its database.

Put it in a repo of its own, then install it into a robkit install:

```sh
cp -r examples/guestbook ~/guestbook
cd ~/guestbook && git init --initial-branch=main && git add -A && git commit -m "Start the guestbook"
cd ~/my-install && pnpm robkit install ~/guestbook
```

Its manifest is the `robkit` field of `package.json`: its name, description, stack, the robkit contract it was made for, who may open it at first, and its icon.
