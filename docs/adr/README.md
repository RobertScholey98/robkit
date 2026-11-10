# Decision records

Each record here is a settled decision a newcomer might question. It says what we faced, what we chose and what follows from it, and links the ticket that made the choice. The tickets keep the full discussion. `.scratch/kit/map.md` lists every decision, settled or not, and links each record.

To change one of these, open a ticket that argues against it. If R accepts it, write a new record that supersedes the old one, and mark the old one superseded rather than deleting it.

| Record                                            | Decision                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [0001](0001-core-owns-the-core-tables.md)         | Core is its own backend, and the only owner of the core tables and the signing key                    |
| [0002](0002-access-codes-only.md)                 | Guests sign in with access codes only                                                                 |
| [0003](0003-core-signs-apps-verify.md)            | Core signs session tokens with Ed25519, and apps verify them locally                                  |
| [0004](0004-per-app-tokens.md)                    | Each app holds its own app token, and no cookie goes on the parent domain                             |
| [0005](0005-one-owner-claims-the-install.md)      | One owner, who claims the install on first run                                                        |
| [0006](0006-roles-gate-apps.md)                   | Roles gate apps, and core holds each app's access rule                                                |
| [0007](0007-one-schema-and-role-per-app.md)       | One Postgres, with a schema and role per app                                                          |
| [0008](0008-packages-update-apps-are-owned.md)    | The `@robkit/*` packages update by version bump; apps are copied and owned                            |
| [0009](0009-one-opinionated-stack.md)             | Every install has one opinionated stack                                                               |
| [0010](0010-local-dev-on-subdomains.md)           | Local dev runs every app on its own subdomain behind one proxy                                        |
| [0011](0011-pure-guard-thin-adapters.md)          | The guard is a pure function, and adapters are thin                                                   |
| [0012](0012-only-the-proxy-reaches-core.md)       | Only the proxy may reach core                                                                         |
| [0013](0013-go-guard-is-a-port.md)                | The Go guard is a port, tested against the same cases                                                 |
| [0014](0014-guard-knows-its-own-address.md)       | The guard works out the app's address from its settings, never from the request                       |
| [0015](0015-sibling-subdomains-are-a-boundary.md) | Each app's origin is a boundary: `__Host-` cookies, the cross-origin rule and the framing headers     |
| [0016](0016-platform-wiring-lives-in-packages.md) | What every app does the same way lives in a package: Drizzle, Vite, serving, tests and core's command |
