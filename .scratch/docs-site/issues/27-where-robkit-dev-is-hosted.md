# 27: Where robkit.dev is hosted

**What to build:** Nothing. This ticket records R's answers. It changes no DNS and publishes nothing. The site builds to static files, and CI keeps them as an artifact of each run.

**Questions for R:**

1. **Which host serves robkit.dev?**
   - **GitHub Pages, published by a workflow in this repo** (recommended). The repo is public, so it costs nothing, needs no new account and stores no secret. R's steps, once: set the custom domain in the repo's Pages settings, add the DNS records GitHub names, and turn on "Enforce HTTPS".
   - **Cloudflare Pages.** Fits if robkit.dev's DNS is already at Cloudflare. It needs a Cloudflare token as a repo secret, or Cloudflare's own GitHub app.
   - **R's own server, behind Coolify.** robkit runs there already. It puts the docs on the same box as R's install.
2. **When does the site publish?**
   - **On each release** (recommended). Once 0.1.0 is out, `main` runs ahead of npm. A site built from every push to `main` would describe things a reader can't install yet.
   - **On each push to `main`.** Simpler, and right until the first release. After it, the site needs a way to say which version a page describes.

Once R answers, the lead writes a deploy ticket for the chosen host. That ticket waits for ticket 28: nothing is published before R has approved the design and the home page's words.

**Blocked by:** none

**Status:** needs-info

- [ ] R has chosen a host and when the site publishes
- [ ] A deploy ticket exists for that choice, blocked by ticket 28
