# 05: Guests sign in with codes

**What to build:** Admin (React, plain JSX + Tailwind) runs at `admin.localhost`, open to the owner only. There the owner mints and revokes access codes. A guest signs in at the hub with a code, or with an intro link that carries it, and sees the launcher. Until roles land in 06, a guest can open only apps open to anyone, and every other app answers them with the generic 404.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] A guest opening admin gets the generic 404
- [ ] An intro link signs the guest in without typing the code
- [ ] Revoking a code ends its sessions at the next refresh
- [ ] The seeded `test` code is refused unless `ROBKIT_DOMAIN` is `localhost`
- [ ] The CI journey adds a guest signing in with a code

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
