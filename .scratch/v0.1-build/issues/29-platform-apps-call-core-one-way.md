# 29: The hub and admin call core one way

**What to build:** The hub and admin each call core and read its `{ error }` answers. Today that's written three times with two result shapes, and the tests check `fetch`'s exact arguments rather than what the page gets back. After this ticket, both apps call core through one helper with one result shape, and the tests check results. Ticket 15 rewrites the hub and admin for each UI kit, so it carries one copy instead of three.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The hub and admin call core through one helper with one result shape
- [ ] The hub's and admin's API tests check what a call returns for each of core's answers, including core being unreachable, not the arguments passed to `fetch`
- [ ] The guest, owner and role journeys pass

Source: the architecture review of 2026-11-03 (see the map)
