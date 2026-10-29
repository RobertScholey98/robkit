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
An owner's app, created by `robkit add` on its own subdomain.
_Avoid_: service, project

**Stack**:
The framework shape an app is built on, such as TanStack Start or React with Hono.
_Avoid_: framework

**Template**:
The files `robkit add` writes for a stack, shipped with the CLI and overridable in `robkit/templates/<stack>`.
_Avoid_: starter, scaffold

**UI kit**:
The optional shared React component library chosen at init.
_Avoid_: design system

**Manifest**:
An app's declaration of its name, icon, access rule and settings.
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
A signed-in browser, held by core and shown to apps as a short-lived session token.

**Session token**:
The Ed25519-signed JWT in the parent-domain cookie.
_Avoid_: JWT, cookie

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
- Each **Stack** has one **Template** and one **Adapter**.
- The **Platform apps** follow the chosen **UI kit**, and each **App** opts in or out of it.

## Example dialogue

> **Dev:** "When the **Owner** adds a **Guest** to the Family **Role**, does the **Guest** see the new **App** straight away?"
> **Owner:** "Within one token lifetime. Their **Session token** still carries the old **Roles** until core refreshes it."
> **Dev:** "And the **App** itself never reads the cookie?"
> **Owner:** "No. The **Adapter** runs the **Guard** and hands the handler a **Viewer**."

## Flagged ambiguities

- "Grant" once meant permission for a guest to open one app. Resolved: **Roles** replaced grants (2026-10-28).
- In robnet, "hub" sometimes meant the backend. Resolved: the **Hub** is the frontend and **Core** is the backend (2026-10-28).
- Open: "generator" means two things. `robkit.json`'s `generators` lists the **Stacks** `add` offers, and build ticket 08 calls the template engine "the generator".
- Open: "layer" means two things. The template engine merges template layers, and the layer rule is about which code may import which.
