---
"@robkit/core": minor
"create-robkit": patch
---

Core's sign-in limit holds under load. `/login` and `/login/code` reserve a place before they check, so a burst gets no more verdicts than the limit. An IPv6 client counts by its /64, and an IPv4-mapped address as its IPv4 address. Wrong access codes are limited to 20 an hour across the install. At most 2 password checks run at once, `/setup`'s included, with 8 more waiting; one more gets 429. Each limit keeps at most 100,000 clients. Every 429 says when to come back, in seconds under a minute. Core logs one line when a limit trips.

`createApp` takes `signInLimits`, for tests and tuning, typed `SignInLimits`. The deploy doc gives the install-wide limit.
