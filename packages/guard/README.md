# @robkit/guard

The pure decision of who may open an app. Given an app's access rule and what the app knows about who is asking, `guard` answers allow, login, refresh or not found.

You won't usually call it yourself. `requestGuard` in `@robkit/session` runs it on every request, and the adapters (`@robkit/hono`, `@robkit/start`) run `requestGuard`. Admin uses its `AccessRule` type and `readAccessRule` to show and edit each app's rule. A new adapter uses `conformance.json` to prove it decides the same way.

## Example

How `requestGuard` calls it, once it has read the app's cookie and fetched the rule:

```ts
import { guard } from "@robkit/guard";

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

const access: AccessRule | undefined = readAccessRule(body.access);
```

## Exports

| Export                      | What it is                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `guard(rule, session)`      | The decision: `{ outcome: "allow", viewer }`, `{ outcome: "login" }`, `"refresh"` or `"not-found"`     |
| `readAccessRule(value)`     | Reads an access rule from `unknown`, or `undefined` if it isn't one                                    |
| `AccessRule`                | `{ kind: "open" }`, `{ kind: "roles", roles }` (role ids) or `{ kind: "owner" }`                       |
| `SessionState`              | What the app knows: `unknown`, `signed-out`, `expired`, or `signed-in` with a viewer                   |
| `Viewer`, `SignedInViewer`  | Who is asking: the owner, a guest with role ids, or `{ kind: "nobody" }`                               |
| `Decision`                  | `guard`'s answer                                                                                       |
| `@robkit/guard/conformance` | `conformanceCases`: the cases in `conformance.json`, typed, that the guard and every adapter must pass |

The whole decision is one table in `src/guard.ts`. `docs/architecture.md` draws it.

## What it must never do

- Import a framework, or do I/O: no `fetch`, no file system, no network, no clock. `tooling/eslint` enforces both.
- Decide differently from `conformance.json`. Change the table and the cases together.
