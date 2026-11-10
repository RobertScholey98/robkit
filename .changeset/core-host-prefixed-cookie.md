---
"@robkit/session": minor
"@robkit/core": minor
---

Core's session cookie is `__Host-robkit_session`, with `Secure`, on an https install, and stays `robkit_session` on an http one. Core reads only that name, so a browser signed in before this change signs in once more.

`sessionTokensIn(cookieHeader, origin)` takes the install's origin and reads only the session cookie by that install's name.
