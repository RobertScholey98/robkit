# 15: The UI kit layer, with shadcn on Base UI

**What to build:** Choosing shadcn on Base UI at init adds `packages/ui` through `shadcn init --base` and restyles the hub, admin and any app that opted in. This ticket builds the kit layer itself, so 16 and 17 only add a kit. With no kit, the hub and admin keep the plain JSX + Tailwind look styled like robnet's shadcn default. Theme tokens are the shared contract between the kit and the no-kit version.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] The kit's hub and admin pass an accessibility check and the guest journey
- [ ] An app added with the kit off renders without importing `packages/ui`
- [ ] The no-kit hub and admin read the same token variables as the kit

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
