# 07: TanStack Start passes the same checks

**What to build:** A TanStack Start example app runs behind the Start adapter and behaves exactly like the Hono one: the same redirect to login and back, the same `/refresh` bounce, and the same access decisions, because both adapters run the shared conformance cases. Server functions receive the verified viewer from a middleware rather than re-reading the request.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The Start adapter passes the shared conformance cases
- [ ] A server function call with an expired session gets the refresh flow, not a silent failure
- [ ] The React client helper surfaces domain errors to the caller and handles session expiry once
- [ ] The CI journey runs against the Start example app too

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
