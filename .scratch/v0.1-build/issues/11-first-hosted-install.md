# 11: First hosted install

**What to build:** An install generated on the default choices deploys to robkit.dev using R's Coolify method: each app in its own container, provisioning and migrate commands as pre-deploy steps, and `ROBKIT_DOMAIN` set to robkit.dev. The owner claims the install through the first-run setup screen, mints a code, and a guest signs in with it on the hub and opens an app on its subdomain over HTTPS. This comes before the other ORMs, package managers and kits so they build on a Dockerfile, env and migrate setup that has already met production. Time-box it, and move what doesn't fit into follow-up tickets.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Core, hub, admin and the example app are each live on their robkit.dev subdomain
- [ ] The owner claims the fresh install on first visit, and the setup screen is gone afterwards
- [ ] An app added with `robkit add` after the first deploy is live after its next deploy
- [ ] The `test` code is refused on the hosted install
- [ ] How a generated app's Dockerfile, env, provision and migrate steps plug into Coolify is written down for tickets 13, 14 and 18 to follow
- [ ] Problems found are fixed in the kit or listed in follow-up tickets

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
