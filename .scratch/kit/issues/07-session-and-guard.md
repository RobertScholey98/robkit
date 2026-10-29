# What session token and guard does the kit ship?

Type: grilling
Status: resolved

## Question

The robnet draft proposes an Ed25519 JWT verified locally against JWKS, a pure guard outcome table (access type by viewer state), and shared JSON conformance cases for adapters. Decide what carries over, the token claims, and whether login is a provider interface from day one so email/password and OIDC can come later.

## Answer

- **Token (R, 2026-10-28):** Ed25519-signed JWT. Only core signs; it publishes `/.well-known/jwks.json`, and every app verifies locally against the cached key. Same flow as robnet: parent-domain HttpOnly cookie with a Max-Age, short-lived token, `/refresh` bounce through core while the session lives, hub login with a return URL otherwise. The guard is a pure package with one adapter per stack, and it hands the verified viewer (user id included) to handlers.
- **Login (R, 2026-10-28, revised):** access codes only in v0.1, with no provider interface. R first chose codes plus OIDC, then scrapped OIDC: adding another login method later means rethinking the access layer, and R accepts that cost. Access follows robnet's model (a person is reached through their code, grants live on codes) unless the spec finds a cheaper clean shape. Exact token claims are left to the spec.
- **Roles (R, 2026-10-28, after resolution):** roles replace per-code app grants. The owner creates roles in admin; on create they tick which codes (guests) hold it, with select all and deselect all, and can edit membership later. A code can hold several roles. Each app's settings in admin gate it to one or more roles (or open, or owner only); `robkit add` asks the same. The token carries the code's roles, so changes apply within one token lifetime. init seeds Family and Friends; the local `test` code holds every role. Spec and prototype updated.
