# What do existing create-stack CLIs already solve?

Type: research
Status: resolved

## Question

Better-T-Stack (create-better-t-stack), create-t3-app and the shadcn registry all scaffold apps from a matrix of options. Find out how each composes templates, how it tests option combinations, how users get updates, and whether robkit could build on one of them instead of writing its own generator. Primary sources only.

## Answer

Nothing to adopt wholesale, but a clear shape to copy.

- **Better-T-Stack** is the closest match (MIT, very active). It stacks one template folder per option dimension in a virtual file system, fills `.hbs` files with Handlebars, patches cross-option code with ts-morph, and saves the choices to `bts.jsonc` for its `add`. Its `add` can't add a new app, it has no update path, no yarn, and shadcn is its only UI.
- **create-t3-app** pre-writes one file per combination and tests all 216 combinations. It is Next.js only, has no `add`, and has had no commits since December 2025.
- **shadcn** is a JSON file registry with AST import rewriting. Its only update path is `add <item> --diff`. It can scaffold a TanStack Start monorepo, and `--base` picks Radix, Base UI or React Aria.
- None of the three upgrades a project after scaffolding.

Recommendation for template composition: write robkit's own small generator in Better-T-Stack's shape (layered templates, a virtual FS, AST post-processors, a saved `robkit.json` that `add` reads, tiered matrix CI). Put platform code in versioned `@robkit/*` packages so updates are dependency bumps. Let init hand shadcn-family UI kits to `shadcn init --base`.

Detail: [research/01-prior-art.md](../research/01-prior-art.md).
