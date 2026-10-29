# Are the hub and admin fixed apps, independent of the user's UI choice?

Type: grilling
Status: resolved

## Question

The shared React UI kit is optional, and the user may pick none. Decide whether the hub and admin ship with robkit's own UI regardless of that choice, how the theme tokens stay consistent across UI libraries, and whether users can restyle or replace the hub.

## Answer

R, 2026-10-28: the hub and admin **follow the user's UI kit choice**. The generator carries a hub and admin variant for each supported kit. If the user picks no kit, the hub and admin are plain JSX with Tailwind, styled to match the default shadcn look robnet has today.

- This makes the UI kit a full layer in the generator for the platform apps, not just for user apps. The kit-testing ticket has to cover each kit's hub and admin.
- Theme tokens (CSS variables) stay the shared contract, so a kit's components and the no-kit version read the same colours.
