# What does a robkit user upgrade, and how?

Type: grilling
Status: resolved

## Question

Decide which parts are npm dependencies that update with a version bump (the guard, session, core, adapters) and which are copied into the user's repo and owned by them from then on (app templates, maybe the hub and admin). Decide how a security fix reaches an existing install.

## Answer

The Ignite model (R, 2026-10-28). Everything a user would change is copied into their repo and owned by them; the engine underneath stays a versioned npm package.

- **Packages (`@robkit/*`, updated by a version bump):** the session token, the guard, core, and the server and client adapters. A security fix reaches every install through a dependency bump. This is the Expo/`next`/`vite` part.
- **Copied and owned:** each app from `robkit add`, the hub's and admin's pages, the repo config, the optional UI kit, and the templates themselves. There is no upgrade path for copied code, only changelogs, the same as Ignite.
- **No eject command.** There is nothing to eject: what's copied is already the user's, and the engine is not meant to be forked.
- Steal Ignite's in-repo templates idea for `robkit add`, so users can tweak what new apps start from (decided in the template composition ticket).
