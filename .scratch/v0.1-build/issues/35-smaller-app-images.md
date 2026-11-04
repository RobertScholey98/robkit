# 35: Smaller core and app images

**What to build:** Ticket 32 halved the hub's and admin's images, but core and the Start example apps keep 54% to 81% of their size after ticket 11, because of what they run on (see ticket 32's Comments). This ticket decides which of these is worth its cost, and builds the ones R picks:

- Bundle each Start app's server build with Vite's `ssr.noExternal`, so `@tanstack/react-start`, React and the router become dev dependencies and Vite's toolchain leaves the image. That changes the stack templates' manifests, which app authors edit.
- Keep core's image free of Prisma in a pnpm install with Prisma, where `drizzle-orm` takes Prisma's packages as optional peers. For example, `@robkit/core` could bundle Drizzle, or the install could override those peers.
- Run Prisma's migrations without the full CLI in the app's image, for example from a separate migrate image or a smaller migrate entry point.

**Blocked by:** 32

**Status:** needs-triage

- [ ] Each change R picks shrinks the images it targets, measured as ticket 32 measured them
- [ ] `test:production` passes, including its check that no image carries a package the app doesn't run on

Source: the build of ticket 32 (2026-11-04)
