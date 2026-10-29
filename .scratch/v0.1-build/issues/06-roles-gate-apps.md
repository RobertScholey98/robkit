# 06: Roles gate apps

**What to build:** In admin, the owner creates roles, ticking which codes hold each one with select all and deselect all, and can edit membership later. In the example app's settings, the owner gates it to anyone, one or more roles, or owner only. A guest's launcher lists only the apps their roles allow, and they can open those apps.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A code can hold several roles, and the session token carries them
- [ ] A role change reaches a signed-in guest within one token lifetime
- [ ] The `test` code holds every role
- [ ] The hub launcher never lists an app the guard would refuse
- [ ] The CI journey adds a guest who opens an app through a role and gets the 404 on an app gated to another role

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
