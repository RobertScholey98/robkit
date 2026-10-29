# Where does core run?

Type: grilling
Status: resolved

## Question

Core owns users, codes, sessions, catalog and audit. A Hono backend and a Start app both need its actions (for example, inviting a guest). Decide between core embedded in the hub with an HTTP interface for other apps, or core as its own container, and what that means for the database roles.

## Answer

R, 2026-10-28: **core is its own Hono backend** (its own container), and **the hub is a lightweight React frontend** for login and the launcher.

- Core is the only process that touches the core tables (users, codes, sessions, catalog, audit) and the only holder of the session signing key. Apps and the hub reach it over HTTP.
- Apps still verify the session locally; they call core only for actions (for example inviting a guest).
- Left for other tickets: whether the hub's static build is served by core or its own container, and whether admin follows the same React-over-core shape ([Are the hub and admin fixed apps...](06-platform-apps-ui.md)); the database roles ([How does each app get its database?](09-app-databases.md)).
