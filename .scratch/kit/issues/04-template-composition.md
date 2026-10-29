# How are templates composed from init's choices?

Type: grilling
Status: resolved

## Question

init asks for a package manager, whether to add an optional shared React UI kit and which one (shadcn, Radix, Base UI, Chakra), Tailwind by default, and dev tools (tests, lint, Husky). The UI kit is opt-in so the kit stays stack-agnostic: a Hono API or a future Go app never sees it. add asks for a stack. Decide whether output is built from layers (base, stack, UI, tooling) merged together, or from one template per combination, and which choices are fixed for the whole repo versus per app.

## Answer

- **Generator shape:** robkit's own small generator in Better-T-Stack's shape: layers per choice merged in a virtual file system, AST post-processors for cross-choice edits, and a saved `robkit.json` that `add` reads. Not a fork, not per-combination templates. See [What do existing create-stack CLIs already solve?](01-prior-art.md).
- **Template source (R, 2026-10-28):** `add` uses the templates shipped with the installed robkit CLI version. A `robkit/templates/<stack>` folder in the repo, if present, replaces or patches that stack, Ignite-style. New stacks reach existing installs through a CLI bump.
- **Override scope (R, 2026-10-28):** package manager, lint, format, tests and Husky are repo-wide, set once at init. Each React app chooses at `add` time whether to use the shared UI kit. Nothing else varies per app.
