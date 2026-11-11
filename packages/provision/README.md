# @robkit/provision

Gives each app of a robkit install its own Postgres schema and a login role that can touch nothing else, both named after the app's slug.

Core runs it in production before it migrates, and the dev runner runs it before `pnpm dev` starts the apps. create-robkit uses it to work out each app's `DATABASE_URL` for a deploy.

It returns what it can refuse as a value, so each command says what to do in its own words: a name that isn't a slug, the role it connects as, a superuser, and a database secret shorter than 32 characters. An app it refuses is left as it was. `provisionDatabases` refuses a short secret before it starts, and stops at the first app it refuses, so the apps before that one are already provisioned.

It never writes a role's password into a statement. The statement that makes or changes the role holds the password's SCRAM-SHA-256 verifier, with a fresh salt each run, and Postgres stores that as it stands. So a statement Postgres logs, such as one that lost a race with another run, shows the verifier and not the password. The verifier is still secret: it lets whoever holds it guess passwords offline.

Postgres runs a password through SASLprep before it salts it, and this package doesn't. The two agree on every ASCII password, as each of robkit's own is. Give `provisionDatabase` an ASCII password: one that SASLprep would change, such as one with a no-break space, makes a role that some clients can't sign in to.

## Example

The provision step in production:

```ts
import { provisionDatabases, readProvisionConfig } from "@robkit/provision";
import { isProblem } from "@robkit/input";

// ROBKIT_ADMIN_DATABASE_URL, ROBKIT_DB_SECRET, and ROBKIT_DATABASES, which
// lists the apps with a database, such as "core,example".
const config = readProvisionConfig(process.env);
if (isProblem(config)) {
  console.error(config.error);
  process.exit(1);
}

const provisioned = await provisionDatabases(config);
if (provisioned.outcome !== "provisioned") {
  // Such as an app named after a superuser. The sentence names the app.
  console.error(provisioned.error);
  process.exit(1);
}
console.log(`provisioned ${config.slugs.join(", ")}`);
```

## Exports

| Export                                          | What it is                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ProvisionRefusal`, `RefusedApp`, `ShortSecret` | What it refuses, each with `outcome` and an `error` sentence. A refused app's sentence names it |
| `readProvisionConfig(env)`, `ProvisionConfig`   | The production provision step's environment                                                     |
| `provisionDatabases(options)`                   | The provision step in production, with each password from `ROBKIT_DB_SECRET`                    |
| `provisionDatabase(adminUrl, slug, password?)`  | One app's schema and role, with the password given or a fresh one. Returns its `DATABASE_URL`   |
| `databasePassword(secret, slug)`, `databaseUrl` | An app's role password (an HMAC of its slug) and its `DATABASE_URL`                             |

## What it must never do

- Depend on anything but `@robkit/input` and `postgres`. Core's image holds it, so it stays small, and the dev runner and core both sit above it.
- Give an app's role access to another schema. Each role reaches its own schema and nothing else.
