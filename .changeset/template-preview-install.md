---
"create-robkit": patch
---

`pnpm preview-install` keeps one linked install up to date with a robkit checkout's templates. It writes only the files whose template changed, removes those the templates dropped, and installs again only when a `package.json` or `pnpm-workspace.yaml` changed.
