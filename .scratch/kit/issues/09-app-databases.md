# How does each app get its database?

Type: grilling
Status: resolved

## Question

Decide the database model for generated apps: one shared Postgres with a schema and role per app, or something else; whether Drizzle is the default or a choice; who runs migrations and when; and how add provisions all of it.

## Answer

- **Model (R, 2026-10-28):** one shared Postgres. `robkit add` creates a schema per app and a login role that can only touch that schema, then writes the app's `DATABASE_URL`. Core gets its own schema and role in the same way; no app role can read core's tables or another app's schema. One container to run, back up and start locally.
- **Migrations (R, 2026-10-28):** each app's image has its own migrate command, run as a one-off before the new container starts (a Coolify pre-deploy command in production, a compose service locally). Apps never migrate at boot. Core follows the same rule, which removes robnet's "deploy the hub first" ordering.
- **ORM (R, 2026-10-28):** init asks which ORM to use: Drizzle (recommended), Prisma or Kysely. The choice is repo-wide like the other tooling, and every template supports each one. The platform contract stays ORM-agnostic: an app gets `DATABASE_URL`, its schema and a migrate hook it defines. Core uses Drizzle internally.
