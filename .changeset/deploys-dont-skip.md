---
"create-robkit": minor
---

`robkit deploy` no longer leaves an app undeployed after a failed or cancelled run. Once an app's deploy finishes, it records the commit it ran from and a hash of the app's variables in the application's description on Coolify. The next deploy compares each app with its record, so an app deploys when it is new, has no record, changed since its recorded commit, or gets new variables. A failed core holds the other apps back, a missing shared variable stops the deploy before it writes anything, and `--dry-run` with `COOLIFY_URL` and `COOLIFY_TOKEN` says what each app would do and why.

The first deploy after this upgrade deploys every app, since none has a record yet.

`robkit upgrade` doesn't change `.github`, so change your install's `.github/workflows/ci.yml` by hand:

- In the top-level `concurrency`, replace `cancel-in-progress: true` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`, so a push to `main` never cancels a run in progress.
- In the deploy job's `pnpm robkit deploy` step, delete the `TURBO_SCM_BASE` line under `env`. `robkit deploy` ignores it now, and works out what changed from each app's record.
