# 17: Run an install: guests, access codes and roles

**What to build:** The page on who gets in. Claiming the install, making an access code in admin, roles, who may open each app, intro links, and what a guest sees from the link to the app.

It says what protects sign-in and what doesn't, from `SECURITY.md`: how many wrong codes the install takes in an hour, and what a short code of the owner's own choosing risks.

Milestone 4 may change two things here: an intro link opened by someone already signed in will ask first (ticket 27 of "Just use it"), and codes under 5 characters may be refused if R says so (ticket 29). Write what the code does on this branch, and list both in the comments.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] The page matches what admin and the hub do, checked in an install made from this checkout, and the Proof says how
- [ ] The numbers on the page are the ones `SECURITY.md` and the code give
- [ ] The comments list what tickets 27 and 29 of "Just use it" would change on the page
- [ ] The PR's CI `gate` job passes on GitHub
