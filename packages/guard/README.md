# @robkit/guard

The pure decision of who may open an app. Given an app's access rule and what the app knows about who is asking, `guard` answers allow, login, refresh or not found.

You won't usually call it yourself. `requestGuard` in `@robkit/session` runs it on every request, and the adapters (`@robkit/hono`, `@robkit/express`, `@robkit/next`, `@robkit/start`) run `requestGuard`. Admin uses its `AccessRule` type and `readAccessRule` to show and edit each app's rule. A new adapter uses `conformance.json` to prove it decides the same way.

## Example

How `requestGuard` calls it, once it has read the app's cookie and fetched the rule:

```ts
import { guard, readCodeId, readRoleId } from "@robkit/guard";
import { orThrow } from "@robkit/input";

// Ids from core: a role's, and the access code the guest signed in with.
// The guard takes them branded, so a string goes through its reader first.
const familyRoleId = orThrow(
  readRoleId("4b0e1f9c-7d2a-4c63-9a51-2f8e6d3b7a10"),
);
const codeId = orThrow(readCodeId("9d3c2a71-5e84-4f0b-8c16-a7b2e4f9d058"));

const decision = guard(
  { kind: "roles", roles: [familyRoleId] },
  {
    state: "signed-in",
    viewer: { kind: "guest", id: codeId, roles: [familyRoleId] },
  },
);
// { outcome: "allow", viewer: { kind: "guest", id: codeId, roles: [familyRoleId] } }
```

How admin reads a rule core sent as JSON (`templates/base/apps/admin/src/client/access-api.ts`):

```ts
import { readAccessRule, type AccessRule } from "@robkit/guard";
import { isProblem } from "@robkit/input";

function accessOf(body: { access?: unknown }): AccessRule | undefined {
  const access = readAccessRule(body.access);
  return isProblem(access) ? undefined : access;
}
```

## Exports

| Export                                                         | What it is                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `guard(rule, session)`                                         | The decision: `{ outcome: "allow", viewer }`, `{ outcome: "login" }`, `"refresh"` or `"not-found"`     |
| `readAccessRule(value)`                                        | Reads an access rule from `unknown`, or an `InputProblem` if it isn't one                              |
| `RoleId`, `CodeId`                                             | Brands for a role's id and an access code's id. Only their readers make them                           |
| `readRoleId(value)`, `readCodeId(value)`, `readRoleIds(value)` | Read an id, or a list of role ids, from `unknown`: any string that isn't empty, or an `InputProblem`   |
| `AccessRule`                                                   | `{ kind: "open" }`, `{ kind: "roles", roles }` (role ids) or `{ kind: "owner" }`                       |
| `SessionState`                                                 | What the app knows: `unknown`, `signed-out`, `expired`, or `signed-in` with a viewer                   |
| `Viewer`, `SignedInViewer`                                     | Who is asking: the owner, a guest with role ids, or `{ kind: "nobody" }`                               |
| `Decision`                                                     | `guard`'s answer                                                                                       |
| `@robkit/guard/conformance`                                    | `conformanceCases`: the cases in `conformance.json`, typed, that the guard and every adapter must pass |

The whole decision is one table in `src/guard.ts`. `docs/architecture.md` draws it.

## What it must never do

- Import a framework, or do I/O: no Node built-in modules, no `fetch`, no `process`. `tooling/eslint` enforces both.
- Decide differently from `conformance.json`. Change the table and the cases together.

## For contributors

- `RoleId` and `CodeId` are brands. The guard doesn't know core's id scheme, so its readers take any string that isn't empty. `readAccessRule`, session's token reader and core's readers make them too, and core's schema types its id columns with them.
- `conformance.json` holds the cases the guard and every adapter pass, tokens for another app, for core and with no audience among them.
