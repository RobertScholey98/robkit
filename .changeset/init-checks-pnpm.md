---
"create-robkit": patch
---

Before it writes anything, init checks that pnpm can run the version the install names, and says how to get one when it's missing or too old: `corepack enable` where Node has Corepack, and `npm install -g pnpm` where it doesn't.
