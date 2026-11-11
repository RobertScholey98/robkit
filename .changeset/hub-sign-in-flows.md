---
"create-robkit": patch
---

The hub's sign-in flows are finished, and one change closes a security gap.

- An intro link no longer replaces a signed-in session without asking. Before, any app on the install could send a signed-in viewer to an intro link of its own and swap their session for a guest's. Now the hub says who is signed in and asks first, and sends core the code only on "yes". A browser that isn't signed in signs in as before.
- A visitor who is signed in already and arrives with `next` goes to that app, by the rule a sign-in follows. The hub forwards a tab to each `next` once a visit, so an app that sends the browser straight back sees the launcher, with a line saying so, instead of a loop. When the browser won't keep the hub's note of a forward, the hub shows the launcher and doesn't forward.
- The launcher checks the session each time it polls, and as its tab becomes visible. Signing out in another tab shows the sign-in page. A core that can't be reached shows the failure and a "Try again" button, not the sign-in page.

`robkit upgrade` doesn't rewrite the hub, so an install that exists copies these files from a new install, or from robkit's `templates/base`, into its own `apps/hub/src/`: `App.tsx`, `forms.tsx`, `launcher.tsx` and the new `forwarded.ts`, with their tests `launcher.test.tsx` and the new `sign-in.test.tsx`. If you changed those files, the intro-link change is the one to keep: it is in `App.tsx`'s `firstScreen` and `IntroQuestion` in `forms.tsx`.
