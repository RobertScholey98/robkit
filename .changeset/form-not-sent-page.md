---
"@robkit/session": minor
---

A form posted as a page load (`Sec-Fetch-Mode: navigate`) that the guard can't take, because the token lapsed or nobody is signed in to a gated app, gets a small HTML page with status 401 instead of the JSON a `fetch` gets. Its one link goes through `/_robkit/refresh` back to the page the form was on, taken from the `Referer` when it is a page on the app. The guard decides who is asking as before, so an open app still hands a signed-out visitor's form to its handler as nobody.
