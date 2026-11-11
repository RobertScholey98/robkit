---
"create-robkit": patch
---

The templates are tidied. A new install and a new app get these. `robkit upgrade` doesn't rewrite the hub, admin, an app or `turbo.json`, so in an install you have, copy what you want by hand, from a new install made with `npm create robkit` or from create-robkit's `templates` folder:

- `turbo.json`: each task depends on a `transit` task, so an edit to `packages/theme` or `packages/core-client` builds and tests again the apps that use it, instead of answering from cache. Copy the whole file, and give any task of your own `"dependsOn": ["transit"]`.
- Each app's page title is the app's slug, not `Example`, and each page sets a viewport. Change the title and add `<meta name="viewport" content="width=device-width, initial-scale=1" />` in `src/routes.tsx` on React + Hono and Express, and in `index.html` on Go. On Next, change `metadata` and add `export const viewport: Viewport = { width: "device-width", initialScale: 1 }` in `src/app/layout.tsx`. On Start, change the title and add `{ name: "viewport", content: "width=device-width, initial-scale=1" }` in `src/routes/__root.tsx`.
- A Next app's `tsconfig.json` lists `next/image-types/global` in `types`, so a page can import an image. The Next stack's `AGENTS.md` has a new section, "Images", on which images work behind the guard: one the page imports, and a `public` file in `<img>` or `<Image unoptimized>`. `<Image src="/logo.png">` shows a broken image.
- A Go app's server answers a folder such as `/assets/` with the page, not a list of its files. Copy `builtPage` from `server.go`.
- A Go app's page says so when a call to `/api/me` fails, and turns its button off while a call is out. It moved into `src/home.tsx`, with a test in `src/home.test.tsx`. Copy both and `src/main.tsx`, add `vitest`, `happy-dom`, `@testing-library/dom`, `@testing-library/react` and `@testing-library/user-event` to its `devDependencies` as `catalog:`, and set its `test` script to `go test ./... && vitest run`.
- A Start app's button turns off while its call is out and says so when the call fails. Copy `src/home.tsx`, `src/home.test.tsx` and `src/routes/index.tsx`, and add `happy-dom`, `@testing-library/dom`, `@testing-library/react` and `@testing-library/user-event` to its `devDependencies` as `catalog:`.
- Admin's Copy button says so when the browser refuses the clipboard, and clears its timer. Copy `apps/admin/src/client/Admin.tsx` and `Admin.test.tsx`, which now test Save access, revoke and copy, working and refused.
- Each stack's `AGENTS.md` no longer calls the app "the example", and React + Hono's says "an `app.get`". The install's `AGENTS.md` describes turbo's `transit` task.
