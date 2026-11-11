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

**Status:** ready-for-agent

- [ ] The failure is on record, with the lines the three failed runs printed
- [ ] `ci.yml`, `production.yml` and `release.yml` install Chromium without `--with-deps`
- [ ] A repo check fails a workflow line that installs a system package, and passes the workflows as they are
- [ ] Every test passes in CI without the nine font packages, shown by this PR's own `check`
- [ ] The PR's CI `gate` job passes on GitHub
