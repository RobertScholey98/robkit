# 07: `robkit add`

**What to build:** In an install, `robkit add` offers only the generators enabled in `robkit.json`, asks for the name, who can open it (anyone, roles, owner only), the UI kit opt-in when relevant, and an icon. It writes `apps/<slug>`, creates the app's schema and role, writes its `.env` with `DATABASE_URL`, and registers it with the launcher. After `pnpm dev`, the new app opens at `<slug>.localhost`, gated as chosen.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Both stacks can be added, and each passes the guest journey
- [ ] The new app's role can only touch its own schema
- [ ] The new app's migrate step runs before it starts
- [ ] `robkit add` with flags works without prompts

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
