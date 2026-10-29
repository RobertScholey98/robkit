# 17: Chakra

**What to build:** Choosing Chakra at init adds `packages/ui` on Chakra and restyles the hub, admin and opted-in apps. Chakra doesn't go through the shadcn CLI, so it gets its own template layer, with the theme tokens mapped into Chakra's theme.

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] The kit's hub and admin pass an accessibility check and the guest journey
- [ ] An app added with the kit off renders without importing `packages/ui`
- [ ] Changing a token variable changes Chakra's rendering and the no-kit version the same way

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
