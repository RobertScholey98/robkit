# robkit

robkit is a kit for self-hosting small apps for friends and family. These are the words the code, docs and CLI use.

## Language

### People

**Owner**:
The one person who runs an install and can open admin.
_Avoid_: admin (for the person), user

**Guest**:
Anyone who signs in with an access code.
_Avoid_: user, member

### Platform

**Install**:
One robkit deployment: a domain, one Postgres, core, the hub, admin and the owner's apps.
_Avoid_: instance, deployment

**Core**:
The Hono backend, sole owner of the core tables and the signing key.
_Avoid_: backend, auth server

**Hub**:
The React frontend for login and the launcher.
_Avoid_: frontend, portal

**Admin**:
The owner's React frontend for codes, roles, sessions, apps and settings.
_Avoid_: dashboard

**Platform apps**:
Core, the hub and admin together.

### Apps

**App**:
An owner's app on its own subdomain, created by `robkit add` or taken from another install with `robkit install`.
_Avoid_: service, project

**App repo**:
An **App**'s own git repository, in its folder under `apps/`. The **Install**'s repository leaves it out, and `robkit.json` records where it comes from and the commit the **Install** runs.
_Avoid_: submodule, package

**Upstream**:
Where an **App repo** is updated from, a URL or a path: where it was installed from, its git remote `upstream`, or else where it was shared to, its remote `origin`. An **Install** that shares an installed **App** to a repo of its own moves `origin` and keeps the **Upstream**.
_Avoid_: registry, store

**Contract**:
What every **Install** of one robkit version gives an **App**: the `@robkit/*` packages, the fixed packages (`@internal/ui`, `@internal/theme`, `@internal/core-client`, `@internal/tsconfig`) and the catalog. An **App** that reaches past it can't move to another **Install**.
_Avoid_: API, platform

**Contract version**:
The number an **App**'s **Manifest** names for the **Contract** it was made for. An **Install** runs the versions its robkit lists, and `robkit install` refuses any other.
_Avoid_: robkit version, API version

**Seed**:
An **App**'s `seed.sql`, which its migrate script runs once, as the **App**, right after the migrations that first make its schema. The provision step marks a schema it has just made, under `pnpm dev` and in production alike.
_Avoid_: fixture

**Stack**:
The framework shape an app is built on, such as TanStack Start or React with Hono. Every **Install** offers every stack.
_Avoid_: framework

**Template**:
The files `robkit add` writes for a stack, shipped with the CLI and overridable in `robkit/templates/<stack>`.
_Avoid_: starter, scaffold

**UI kit**:
The shared React component library every **Install** has: shadcn on Base UI, in `packages/ui`. It is not a choice.
_Avoid_: design system

**Manifest**:
An app's declaration of its name, stack, **Contract version**, icon, access rule and settings: the `robkit` field of its package.json.
_Avoid_: config

### Access

**Access code**:
What a guest types to sign in, holding the guest's roles and expiry.
_Avoid_: invite code, password

**Intro link**:
A link that signs a guest in with a code without typing it.
_Avoid_: magic link, invite link

**Role**:
A named group of guests that the owner creates in admin.
_Avoid_: grant, group

**Session**:
A signed-in browser, held by core and shown to each app as a short-lived **App token**.

**Session token**:
An Ed25519-signed JWT core issues for one audience. Core's own, with the audience `core`, sits in a host-only cookie on core's subdomain and names the **Session**.
_Avoid_: JWT, cookie

**App token**:
A **Session token** core mints for one **App**, admin included, with the app's slug as its audience, in a host-only cookie on the app's subdomain. Only that app accepts it, it names no **Session**, and core never renews from it.
_Avoid_: app cookie, per-app session

**Viewer**:
Who is asking, as an app sees it after the guard: the owner, a guest with roles, or nobody.
_Avoid_: user, current user

**Guard**:
The pure function that turns an app's access rule and the viewer into allow, login, refresh or not found.
_Avoid_: middleware, auth check

**Adapter**:
The per-stack glue that runs the guard and hands the viewer to the app's handlers.
_Avoid_: plugin, integration

## Relationships

- An **Install** has exactly one **Owner**, who claims it on first run, and any number of **Guests**.
- Each **Guest** signs in with one **Access code**. An **Intro link** carries one **Access code**.
- An **Access code** holds zero or more **Roles**. Init seeds the **Roles** Family and Friends.
- An **App**'s **Manifest** sets its access rule: open to anyone, gated to one or more **Roles**, or owner only.
- A **Session token** carries its **Access code**'s **Roles**, so a role change reaches a **Guest** within one token lifetime.
- Core holds each **Session** and its own **Session token**. Each **App** holds only its own **App token**, which it gets from core's refresh.
- Each **Stack** has one **Template** and one **Adapter**.
- Every **App** but the **Platform apps** is an **App repo**. Its **Manifest** names one **Contract version**, and it moves between **Installs** through its **Upstream**.
- The **Platform apps** and every **App** draw with the **UI kit**.

## Example dialogue

> **Dev:** "When the **Owner** adds a **Guest** to the Family **Role**, does the **Guest** see the new **App** straight away?"
> **Owner:** "Within one token lifetime. Their **Session token** still carries the old **Roles** until core refreshes it."
> **Dev:** "And the **App** itself never reads the cookie?"
> **Owner:** "No. The **Adapter** runs the **Guard** and hands the handler a **Viewer**."
> **Dev:** "Could an **App** I imported use the token it holds to open admin?"
> **Owner:** "No. It holds an **App token** for its own slug, and admin and core refuse it."

## Flagged ambiguities

- "Grant" once meant permission for a guest to open one app. Resolved: **Roles** replaced grants (2026-10-28).
- In robnet, "hub" sometimes meant the backend. Resolved: the **Hub** is the frontend and **Core** is the backend (2026-10-28).
- "generator" once meant two things: `robkit.json`'s `generators` listed the **Stacks** `add` offered, and the build tickets call the template engine "the generator". Resolved: every **Install** offers every **Stack**, so `robkit.json` records only the example app's stack, and "generator" means the template engine (2026-11-05).
- "layer" once meant two things: the template engine merged template layers, and the layer rule is about which code may import which. Resolved: the templates are no longer layered, so "layer" means the layer rule (2026-11-05).
