# 0008: The packages update by version bump; apps are copied and owned

**Status:** accepted, 2026-10-28 (R). Source: [What does a robkit user upgrade, and how?](../../.scratch/kit/issues/05-upgrade-path.md)

## Context

A kit that writes files into your repo has to say what happens when the kit improves. Codemods and three-way merges of generated files are fragile, and an eject command splits installs into two kinds.

## Decision

robkit follows Ignite's model. The engine is a set of `@robkit/*` packages: the session token, the guard, core, the server adapters and the client helper. A security fix reaches every install through a dependency bump. Everything an owner would change is copied into their install and owned by them: each app, the hub's and admin's pages, the config, the UI kit and the templates. There is no eject command.

## Consequences

- Copied code has no upgrade path but the changelog.
- The packages' public API is a promise, so it stays small. Each package's README lists its exports.
- An install can replace a stack's template whole by putting its own in `robkit/templates/<stack>`.
