---
"@robkit/core": patch
---

Core answers a POST whose JSON isn't an object, such as `[]`, `"rob"` or `null`, with 400 and "Send a JSON object.", rather than saying a field is missing.
