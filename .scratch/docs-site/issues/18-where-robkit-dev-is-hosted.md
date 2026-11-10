# 18: Where robkit.dev is hosted

**What to build:** Nothing until R answers. The site builds to static files, and CI keeps them as an artifact of each run. Putting them at robkit.dev needs a host and the domain's DNS, and both are R's.

**Question for R:** where should robkit.dev be hosted?

- **GitHub Pages, deployed by a workflow on `main`** (recommended). No new account and no secret to store: the workflow uses the repo's own token. It needs the repo to be public, or a paid plan. R points the domain at it once.
- **Cloudflare Pages.** Fits if robkit.dev's DNS is already at Cloudflare. It needs a Cloudflare token as a repo secret, or Cloudflare's own GitHub app.
- **R's own server, behind Coolify.** robkit runs there already. It puts the docs on the same box as R's install.

Once R answers, this ticket becomes the deploy: a workflow that publishes `main`'s build, and the steps R does once.

**Blocked by:** none

**Status:** needs-info

- [ ] R has chosen a host
- [ ] A push to `main` that changes the site publishes it
- [ ] robkit.dev serves the site over https
