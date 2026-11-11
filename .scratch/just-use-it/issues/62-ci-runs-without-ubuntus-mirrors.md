# 62: A CI run doesn't need Ubuntu's mirrors

**What to build:** The `check` job installs Chromium with `playwright install --with-deps chromium`. `--with-deps` runs `apt-get`, which fetches from Ubuntu's mirrors. On 2026-11-11, GitHub's runners couldn't resolve `azure.archive.ubuntu.com`, `archive.ubuntu.com` or `security.ubuntu.com` from 14:10 UTC until at least 16:28. The `check` job of pull request 148 failed three times at that step, before any test ran:

```text
Temporary failure resolving 'security.ubuntu.com'
E: Unable to fetch some archives, maybe run apt update or try with --fix-missing?
Failed to install browsers
Error: Installation process exited with code: 100
```

The same runs fetched from `packages.microsoft.com` and the npm registry, so only Ubuntu's hosts were out of reach. Nothing merges while that lasts.

The runner's image, `ubuntu-26.04`, already has every library Chromium needs. `--with-deps` adds only nine font packages:

```text
The following NEW packages will be installed:
  fonts-freefont-ttf fonts-ipafont-gothic fonts-tlwg-loma-otf fonts-unifont
  fonts-wqy-zenhei xfonts-cyrillic xfonts-encodings xfonts-scalable
  xfonts-utils
```

- **The workflows install the browser alone**, with `playwright install chromium`, in `ci.yml`, `production.yml` and `release.yml`. Playwright downloads the browser from its own host.
- **A repo check fails a workflow that installs a system package**, so the step doesn't come back.
- **`CONTRIBUTING.md` and `docs/testing.md` keep `--with-deps`.** A contributor's machine may lack the libraries.

**Blocked by:** none

**Status:** done

- [x] The failure is on record, with the lines the three failed runs printed
- [x] `ci.yml`, `production.yml` and `release.yml` install Chromium without `--with-deps`
- [x] A repo check fails a workflow line that installs a system package, and passes the workflows as they are
- [x] Every test passes in CI without the nine font packages, shown by this PR's own `check`
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, 2026-11-11

- **The failure couldn't be reproduced on my machine**, where Ubuntu's mirrors resolved all along. The three failed runs are the record: pull request 148's `check`, in run 43035275234, at 14:06, 16:05 and 16:17 UTC.
- **I dropped `--with-deps` rather than falling back when it fails.** A step that falls back would run the tests with other fonts on the day the mirrors are out, and would take ten minutes to get there, since apt retries each host. Now every run installs the same thing.
- **The repo check** is `systemPackageInstalls` in `tooling/repo-checks/src/workflows.ts`. It fails `--with-deps`, `playwright install-deps`, and `apt install` or `apt-get install`, and lets a comment name one. It reads the template's workflows too, which install no system package.
- **What this gives up.** If GitHub's image drops a library Chromium needs, Chromium won't start, and Playwright's message names the library. Install that one package in the step then, and let the check pass that line.
- **`production.yml` and `release.yml`** have the same step on the same image. Neither ran here.
- No changeset. Workflows, a repo check and this ticket changed.

### Proof

- **Red, then green.** In WSL, the check's five cases failed against a stub. Once written, the check failed on the three workflows and named each line. With the workflows changed, the repo checks passed, 383 tests in 39 files.
- **Pull request 149's `check`** installed Chromium in ten seconds, with no call to apt, and every test passed without the nine font packages.

### Merged

Added by the lead. PR 149 merged into `main` on 2026-11-11 as `1285381c`, with `gate` green on `8b9c8d5`. This note reaches `main` with the docs site's branch, to save a CI run of its own.
