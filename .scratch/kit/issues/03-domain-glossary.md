# What is robkit's domain glossary?

Type: grilling
Status: resolved

## Question

Fix the words the kit, its docs and its CLI use: hub, admin, app, stack, template, guard, viewer, access code, intro link, grant, core and so on. Decide which robnet terms carry over, which change, and where the glossary lives.

## Notes

- R asked (2026-10-28) whether "the hub" means the core backend. Define **hub** (the login and launcher frontend) and **core** (the backend that owns users, codes and sessions and holds the signing key) as distinct terms, even if core is embedded in the hub's process.

## Draft terms (for R to react to)

- **Install:** one robkit deployment: a domain, one Postgres, core, the hub, admin and the user's apps.
- **Owner:** the person who runs the install and can open admin.
- **Guest:** anyone who signs in with an access code.
- **Core:** the Hono backend. Sole owner of the core tables and the signing key.
- **Hub:** the React frontend for login and the launcher.
- **Admin:** the owner's React frontend for codes, sessions, apps and settings.
- **Platform apps:** core, hub and admin together.
- **App:** a user's app, created by `robkit add` on its own subdomain.
- **Stack:** the framework shape an app is built on (TanStack Start; React with Hono).
- **Template:** the files `robkit add` writes for a stack, shipped with the CLI and overridable in `robkit/templates/<stack>`.
- **UI kit:** the optional shared React component library chosen at init.
- **Access code:** what a guest types to sign in. It carries the guest's grants and expiry.
- **Intro link:** a link that signs a guest in with a code without typing it.
- **Grant:** permission for a guest to open one app.
- **Session:** a signed-in browser, held by core and shown to apps as a short-lived token.
- **Session token:** the Ed25519-signed JWT in the parent-domain cookie.
- **Viewer:** who is asking, as an app sees it after the guard: owner, guest with grants, or nobody.
- **Guard:** the pure function that turns an app's access rule and the viewer into allow, login, refresh or not found.
- **Adapter:** the per-stack glue that runs the guard and hands the viewer to the app's handlers.
- **Manifest:** an app's declaration of its name, icon, access rule and settings.

## Answer

- **One owner per install (R, 2026-10-28),** set at init. Init asks for the owner's login, and core stores it hashed (not in env, unlike robnet). Everyone else is a guest. Making owner a role later is a contained change.
- The draft terms above are the glossary. It ships as `GLOSSARY.md` at the robkit repo root (the domain-modeling convention). R can rename any term in review.
