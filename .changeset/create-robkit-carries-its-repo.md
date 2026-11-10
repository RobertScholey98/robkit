---
"create-robkit": minor
---

create-robkit carries what an install takes from robkit: the catalog, pnpm's version, each package's version, the lint policy and the Go module. Its build writes them into the package, so `npm create robkit` works with no robkit checkout. `--link` still reads the checkout.
