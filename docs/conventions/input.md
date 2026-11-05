# Reading input

Every value that comes from outside robkit's own code goes through a reader once, where it enters. That covers files, environment variables, command arguments, HTTP bodies and token claims. Code past the reader trusts the type and checks nothing again.

## The rule

A reader takes the raw value and returns the typed value or an `InputProblem`:

```ts
interface InputProblem {
  readonly error: string;
}
```

- The reader takes `unknown`, or `Env` for environment variables. It never casts. ESLint's `no-unsafe-type-assertion` refuses a cast in any file that isn't a test.
- The problem's `error` names the file or variable, the key, and what to do about it. Write it for the person who has to fix the input.
- The reader doesn't throw or exit. Its caller decides what a problem means: core and the dev runner refuse to start, a command throws its message as a `Problem` from `@robkit/dev` (see `errors.md`), and an HTTP route answers 400.
- When several values are read together, report every problem at once with `allProblems`, a line each, so one run shows everything to fix.
- A value with a meaning beyond its type gets a brand that only its reader makes. A `Slug` comes only from `readSlug`, so a function that takes one can't be handed a string nobody checked.

The shared readers live in `@robkit/session/input` (environment variables, JSON, an app's `robkit` field) and `@robkit/session/addresses` (slugs). Every robkit package and every app can import them.

## Example

`readServeEnv` reads where a server listens:

```ts
export function readServeEnv(
  env: Env,
): { host: string; port: number } | InputProblem {
  const host = readHost(env);
  const port = readPort(env, "PORT", 3000);
  if (isProblem(host) || isProblem(port)) {
    return allProblems(host, port);
  }
  return { host, port };
}
```

An app's `serve.ts` calls it once, at start:

```ts
const listen = readServeEnv(process.env);
if ("error" in listen) {
  console.error(listen.error);
  process.exit(1);
}
const { host: hostname, port } = listen;
serve({ fetch: app.fetch, hostname, port });
```

With `PORT=80000` the app prints this and stops:

```text
PORT is "80000", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.
```

## Tests

Test each reader through its return value. Cover a good value, then each bad shape that applies: malformed text, `null`, the wrong shape, a missing key, and a value out of range. Assert the whole message, so a change to what the user reads shows in the diff.
