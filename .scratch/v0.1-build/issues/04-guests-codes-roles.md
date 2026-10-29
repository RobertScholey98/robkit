# 04: Guests, codes and roles

**What to build:** In admin (React, plain JSX + Tailwind), the owner mints access codes and creates roles, ticking which codes hold each role with select all and deselect all, and can edit membership later. In the example app's settings in admin, the owner gates it to anyone, one or more roles, or owner only. A guest signs in at the hub with a code, or with an intro link, sees only the apps their roles allow in the launcher, and opens them; anything else answers the generic 404.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A code can hold several roles, and the session token carries them
- [ ] A role change reaches a signed-in guest within one token lifetime
- [ ] Revoking a code ends its sessions at the next refresh
- [ ] The seeded `test` code holds every role and is refused unless `ROBKIT_DOMAIN` is `localhost`
- [ ] The hub launcher never lists an app the guard would refuse

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
