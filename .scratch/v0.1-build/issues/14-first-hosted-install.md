# 14: First hosted install

**What to build:** A generated install deploys to robkit.dev using R's Coolify method: each app in its own container, migrate commands as pre-deploy steps, and `ROBKIT_DOMAIN` set to robkit.dev. A guest signs in with a code on the hub and opens an app on its subdomain over HTTPS.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] Core, hub, admin and the example app are each live on their robkit.dev subdomain
- [ ] The `test` code is refused on the hosted install
- [ ] Problems found are fixed in the kit or listed in follow-up tickets

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
