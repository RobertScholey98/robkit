---
"create-robkit": patch
---

The Go guard reads `ROBKIT_APP` and `ROBKIT_CORE_URL` itself when `Options` leaves `App` or `Core` empty, so a Go app gets its guard in one call, `session.Guarded(session.Options{})`, with one error to check.
