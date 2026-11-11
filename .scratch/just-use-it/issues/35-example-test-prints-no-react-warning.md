# 35: The example app's test prints no React warning

**What to build:** `pnpm test` in a new React + Hono or React + Express app passes, and prints React's warning once for each test that renders the page:

```text
An empty string ("") was passed to the href attribute. To fix this, either do not render the element at all or pass null to href instead of an empty string.
```

Under Vitest, `import styles from "./styles.css?url"` gives an empty string, so the page's `<link rel="stylesheet" href={styles} />` has an empty `href`. [Ticket 08](08-test-a-route-as-a-viewer.md) noted the empty `href` and that the tests don't look at it, but React's warning reaches the reader's terminal. The docs site's React + Hono guide tells the reader to run `pnpm test`, and the first thing they see is a warning about code they didn't write. React + Express links its stylesheet the same way, in `src/routes.tsx`, and its test prints the same warning.

Found while writing the docs site's tickets 11 and 12, in apps `robkit add notes` made on each stack from this checkout.

- **The example's test runs quietly.** The page leaves out the `<link>` when there's no stylesheet, or the stack's Vitest config gives the stylesheet a URL.
- **The page is unchanged under `pnpm dev` and in production.**

**Blocked by:** none

**Status:** needs-triage

- [ ] `pnpm test` in a new React + Hono app prints no React warning
- [ ] The same holds for React + Express
- [ ] The page links the stylesheet under `pnpm dev` and in the built app, as now
- [ ] The PR's CI `gate` job passes on GitHub
