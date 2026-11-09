---
"@robkit/session": minor
---

On an https install the guard's cookies are `__Host-robkit_session` and `__Host-robkit_state`, with `Secure`, `Path=/` and no `Domain`, so an app on a sibling subdomain can't plant one. An http install, which is only ever a local one, keeps `robkit_session` and `robkit_state`. The protocol of the install's origin decides, not its domain. `sessionCookies(origin)` gives the names and how to set them.

The guard doesn't read the old plain names on an https install, so a browser signed in to an app before this change goes through core once more.

A cookie's name matches only when it is exactly the name once spaces and tabs around it are trimmed. A name in another case, or with another kind of space before it, such as a no-break space, isn't the session cookie.
