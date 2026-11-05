# Changesets

Each change to a published package's source (`packages/*/src`, tests aside) carries a changeset: a markdown file here naming each package it changes and whether the change is a patch, minor or major. Run `pnpm changeset` to write one. CI fails a pull request that changes a published package's source without one.

robkit doesn't publish to npm yet, so nothing runs `changeset version` or `changeset publish`.
