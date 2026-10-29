# Who may sign in through OIDC, and with what access?

Type: grilling
Status: closed (out of scope)

## Question

With codes, the owner decides who gets in by minting a code. OIDC lets anyone with a Google (or company) account reach the login button. Decide the sign-up policy (invite-only by email, allowed email domains, open with no grants, owner approval), what grants a new OIDC user starts with, how an invited person's code and their later OIDC identity link to one user, and how providers are configured (generic OIDC issuer, client id and secret in env).

## Out of scope

R scrapped OIDC for v0.1 on 2026-10-28. Adding it later is a fresh effort that rethinks the access layer.
