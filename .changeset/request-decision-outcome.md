---
"@robkit/session": patch
"@robkit/hono": patch
"@robkit/start": patch
---

`RequestDecision` is tagged with `outcome`, like every other union of outcomes: `{ outcome: "serve", viewer }` or `{ outcome: "answer", response }`. An adapter switches on `decision.outcome` rather than testing `"response" in decision`.
