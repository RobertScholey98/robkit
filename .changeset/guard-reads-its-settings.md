---
"@robkit/session": minor
---

`requestGuard()` needs no options. It reads `ROBKIT_APP` and `ROBKIT_CORE_URL` itself, and a setting that's missing or won't do ends the process with the reader's message and no stack, as `orExit` does.

- Every option is optional. `app` and `core` also take a plain string, read by the same readers, and a problem names the option, such as `guarded()'s core`.
- Every `core` goes through the reader, a `CoreOrigin` included, so http on a domain that isn't local is refused however it was typed, as Go's `Guarded` already did.
- `appOrigin()` reads what it isn't given the same way.
