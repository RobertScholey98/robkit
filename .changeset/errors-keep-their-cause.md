---
"@robkit/core": patch
"@robkit/session": patch
"@robkit/dev": patch
"create-robkit": patch
---

Errors keep their cause and say what to do. The guard tells `onUnavailable` why it answered 503, core logs every unexpected error through `logError`, every outbound request has a timeout, and the command lines print a known problem without a stack. `robkit check` also checks an install's shared packages.
