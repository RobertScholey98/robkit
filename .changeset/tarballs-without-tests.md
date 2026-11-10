---
"@robkit/core": patch
"create-robkit": patch
"@robkit/dev": patch
"@robkit/drizzle": patch
"@robkit/express": patch
"@robkit/guard": patch
"@robkit/hono": patch
"@robkit/input": patch
"@robkit/next": patch
"@robkit/provision": patch
"@robkit/react": patch
"@robkit/serve": patch
"@robkit/session": patch
"@robkit/start": patch
"@robkit/vite": patch
---

The package no longer ships robkit's own tests: `*.test.ts`, `*.test-d.ts` and `src/test`. create-robkit's templates keep theirs, since they are an install's.
