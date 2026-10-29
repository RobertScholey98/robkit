# How should the init and add wizards flow?

Type: prototype
Status: resolved

## Question

Prototype the prompt sequence for init and add: questions, order, defaults, what can be skipped, and the non-interactive flags. React to a rough clickable or terminal mock rather than a list.

## Prototype

Throwaway clickable mock: https://claude.ai/artifact/LG1FQFNuWkWfKAvYBKo7Gm (source in the project files at wayfinder/robkit/kit/prototypes/cli-flow.html). init asks: project folder, domain, owner username and password, package manager, ORM, shared UI kit (y/n then which), dev tools, install and git. add asks: name, stack (later stacks shown disabled), who can open it, use the UI kit, launcher icon. Both end with next steps and the equivalent non-interactive command. Waiting on R's reactions.
- R, 2026-10-28: init must not ask for a domain. It may not be known yet, and the install may be hosted locally. The domain is runtime config (`ROBKIT_DOMAIN` in env, defaulting to `localhost`), set wherever it's hosted; every subdomain derives from it. Prototype updated.
- R, 2026-10-28: init always adds an example app (`apps/example`, from the TanStack Start template, guests-with-a-grant access) and seeds an all-access code `test`, so a fresh install has something to sign in to and open. The `test` code works only while `ROBKIT_DOMAIN` is `localhost`, so it can't leak into a hosted install. Prototype updated.

## Answer

The flow in the prototype, as amended: init asks for the project folder, owner login, package manager, ORM, the shared UI kit (y/n, then which), dev tools, and install plus git. It never asks for a domain. It adds the example app and the local-only `test` code. add asks for the name, stack, who can open it, whether to use the UI kit, and the launcher icon. Both print next steps and the equivalent non-interactive command. R approved the rest of the mock without changes.
- R, 2026-10-28 (after resolution): init also asks which app generators `robkit add` should offer (multi-select of the available stacks: TanStack Start, React + Hono; later stacks shown disabled). The choice is saved as `generators` in `robkit.json`, `add` lists only those, and more can be enabled later by editing it. Templates still ship with the CLI and can be overridden in `robkit/templates/<stack>`. The example app uses the first enabled generator. Prototype updated.
- R, 2026-10-29: init no longer asks for the owner's login. The owner claims the install on first run, through a setup screen the hub shows while core has no owner (the Coolify model), so the password never passes through init and a hosted install gets its owner the same way. Prototype not yet updated.
