---
"@robkit/dev": minor
---

`@robkit/dev` exports `refusedAppSettings`, the names an app's `.env` can't set: each one `pnpm dev` decides for every app, any name that starts `ROBKIT_`, and `NODE_ENV`. robkit.dev's settings page is built from it. Its lists are typed `readonly string[]` and its prefix `string`, so a name added later changes no type.
