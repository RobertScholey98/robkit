# What does one-command local dev look like?

Type: grilling
Status: resolved

## Question

Decide how a user runs the hub, admin, Postgres and every app locally with one command: subdomains on `*.localhost`, a shared session cookie, hot reload per app, and whether it is Docker Compose, turbo dev, or both.

## Answer

R, 2026-10-28: Docker Compose runs only Postgres locally. `turbo dev` runs core, the hub, admin, the example app and every added app as native processes with hot reload. A small robkit dev proxy on `:3000` routes `hub.localhost`, `admin.localhost`, `<slug>.localhost` and core to each process's port. URLs, the parent-domain cookie and the `/refresh` flow therefore behave exactly as in production, with `ROBKIT_DOMAIN=localhost`. The proxy also runs the per-app migrate steps and core's before starting the apps.
