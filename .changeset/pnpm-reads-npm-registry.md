---
"create-robkit": patch
---

init's `pnpm install` uses the registry `npm create` ran with. pnpm doesn't read npm's `npm_config_registry`, so init hands it on as pnpm's own setting.
