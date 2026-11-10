# Changesets

Each change to a published package's source (`packages/*/src`, tests aside) carries a changeset: a markdown file here naming each package it changes and whether the change is a patch, minor or major. Run `pnpm changeset` to write one. CI fails a pull request that changes a published package's source without one.

Every package releases at one version: `config.json` puts `create-robkit` and every `@robkit/*` package in one fixed group. Before 1.0.0, a change that breaks an install is `minor`, and a repo check fails on a `major` one.

A change an owner must act on names create-robkit too, and says what to do, since `robkit upgrade` prints create-robkit's changelog.

`pnpm release:version` turns the waiting changesets into a version pull request, and the release workflow publishes it. CONTRIBUTING.md's "Releasing" walks through it.
