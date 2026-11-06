---
"@robkit/session": patch
---

When the guard can't load an app's access rule from core, the `GuardFault` it hands `onUnavailable` says how core's answer failed. `reason` is `unknown-app`, `bad-answer`, `invalid-json` or `interrupted-body`, and `cause` keeps the error underneath, such as the JSON parser's. `AccessRuleFailure` names the four. A body cut off part way in dev now fails as `interrupted-body`, as it does in production, rather than as core being down.
