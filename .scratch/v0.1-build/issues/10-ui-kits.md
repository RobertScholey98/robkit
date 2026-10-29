# 10: UI kits

**What to build:** Choosing shadcn on Base UI, shadcn on Radix or Chakra at init adds `packages/ui` and restyles the hub, admin and any app that opted in. With no kit, the hub and admin keep the plain JSX + Tailwind look styled like robnet's shadcn default. Theme tokens stay the shared contract across all four.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] shadcn-family kits are installed through the shadcn CLI's `--base` option
- [ ] Each kit's hub and admin pass an accessibility check and the guest journey
- [ ] An app added with the kit off renders without importing `packages/ui`

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
