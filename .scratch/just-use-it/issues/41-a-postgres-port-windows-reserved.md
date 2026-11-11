# 41: pnpm dev says what to do when Windows has reserved Postgres's port

**What to build:** On Windows, an owner runs robkit in WSL with Docker Desktop. That is the way the README and the docs site give. After some restarts of Windows, `pnpm dev` in a new install can fail there with Docker's own words and nothing from robkit. This is what Docker said of port 54400 on 2026-11-11:

```text
Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:54400 -> 127.0.0.1:0: /forwards/expose returned unexpected status: 500
```

Windows reserves ranges of TCP ports at each start, a hundred ports at a time, between 49152 and 65535. Docker Desktop publishes a container's port through Windows, and can't publish one inside a reserved range. An install's Postgres is published on 54320 unless `ROBKIT_POSTGRES_PORT` says otherwise, which is inside the span Windows reserves from.

`pnpm dev` checks the port before it starts Compose, by listening on it. In WSL that listen succeeds on a reserved port, so the check passes, and `docker compose up` then fails.

Found on 2026-11-11, when the docs site's builder ran installs in WSL on ports 54403 and 54416 after a restart of the machine. Windows had reserved 53844 to 54243 and 54335 to 54934 that day. 54320 sat in the gap between two of those ranges, so a default install would have started. On another day it won't.

- **Say what happened and what to do.** When Compose fails because the port can't be published, `pnpm dev` says Windows has reserved the port, and to set `ROBKIT_POSTGRES_PORT` in the install's `.env` to a port below 49152.
- **Decide the default.** Either keep 54320 and rely on the message, or move the default below 49152, where Windows reserves nothing. Moving it changes `compose.yaml` and `env.ts` for new installs, and an install that exists keeps its port until its owner changes it.
- **Docs.** The docs site's "What you need" page, or its page on `pnpm dev`, says what the error means.

**Recommended:** both. The message costs little and helps every owner whose port can't be published, whatever the cause. A default below 49152 means a new owner on Windows never meets it.

**Open for R:**

1. Should the default move, and to which port? 5432 is Postgres's own and is often taken by a Postgres the owner already runs. A port such as 25432 is free on most machines.
2. `ROBKIT_DEV_PORT` is 3000 and every app's port follows it, so those are below the span already. Nothing to decide there.

**Blocked by:** none

**Status:** needs-triage

- [ ] With the Postgres port inside a range Windows has reserved, `pnpm dev` in WSL names the port, says Windows reserved it, and says which setting to change
- [ ] The default Postgres port is the one R chose, in `compose.yaml`, `env.ts` and the docs
- [ ] A changeset names `@robkit/dev`, and create-robkit if the template's `compose.yaml` changes
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### What was checked, 2026-11-11

- `netsh interface ipv4 show excludedportrange protocol=tcp` in Windows listed the reserved ranges: 49677 to 49976, 50000 to 50788, 53844 to 54243 and 54335 to 54934.
- In WSL (Ubuntu 22.04, Docker Desktop 29.9.2), a Node process listened on `127.0.0.1:54400` without error. That is what `isTaken` in `packages/dev/src/checks.ts` does, so the check would pass.
- `docker run -p 127.0.0.1:54400:5432 postgres:18-alpine` then failed with the error above. The same command with a port Docker chose, 32768, worked, and the port answered from WSL.
- On Windows without WSL, a Node process that listens on 54400 fails with `EACCES`, which `isTaken` reads as taken. robkit doesn't run there.
- robkit's own tests take their ports between 20000 and 30000 (`freePortBlock` in `tooling/test-postgres`), below the span Windows reserves from, so they don't meet this.
- Not checked: Compose's own output for the same failure, and whether Docker Desktop on macOS has anything like it.
