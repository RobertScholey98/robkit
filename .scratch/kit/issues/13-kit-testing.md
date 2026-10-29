# How does robkit test itself?

Type: grilling
Status: resolved

## Question

Decide how CI proves the kit works: generating every supported combination of choices, running each one's lint, typecheck, tests and build, and an end-to-end journey (code login, launcher, app) against the local stack.

## Notes

- The ORM choice (Drizzle, Prisma, Kysely) multiplies the matrix along with package manager and UI kit. Decide which combinations run on every PR and which run daily.
- The hub and admin have a variant per UI kit plus the no-kit JSX version, so each one needs a build and an end-to-end login check.

## Answer

R, 2026-10-28: robkit's own CI generates real projects. Each PR builds a pairwise set (about 12 combinations covering every pair of choices at least once). Each combination is generated into a temp folder, installed, linted, typechecked and built. One end-to-end journey runs per stack: sign in with the `test` code, then open the launcher, then open the example app. A nightly job builds the full matrix (3 package managers × 3 ORMs × 4 UI options × 2 stacks = 72). The bun job is required (see the package-managers research). Fast snapshot tests of generated files can sit in front of all this.
- R, 2026-10-28: none of this ships to users. A generated install gets only CI for its own single combination (lint, typecheck, test, build its apps). The matrix and generator tests live in the robkit repo alone.
