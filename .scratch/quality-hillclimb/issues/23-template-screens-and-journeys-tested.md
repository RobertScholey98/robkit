# 23: The template screens and each journey tested on their own

**What to build:** The admin and hub screens have component tests, and each whole-stack journey can run on its own. Two oversized e2e files are split along their journeys.

Today:
- The access-code and role forms in admin, and the hub's launcher, are tested only through the whole-stack test.
- `tooling/e2e/src/install-journeys.ts` runs its journeys in one sequence, where later ones depend on earlier ones.
- `install-journeys.ts` and `production-stack.ts` are each about 500 lines.

Raises rubric categories 8 (testing) and 5 (simplicity). Evidence: `../research/council-r3-opus.md` sections 5 and 8; `../research/council-r3-sol.md` section 8; `../research/council-r3-sonnet.md` section 5.

- **Component tests** for the admin and hub screens, in `templates/base/apps/admin/src/client/` and `templates/base/apps/hub/src/`. Use Testing Library against a fake `callCore`, covering the access-code and role forms' success and error states and the launcher. They run in the fast gate through the install check.
- **Independent journeys.** Each journey in `install-journeys.ts` sets up the claimed install it needs, so `vitest -t "<journey>"` runs any one alone. Show it by running two journeys alone.
- **Smaller files.** Split `production-stack.ts` into the stack's lifecycle (build, start, stop) and its assertions, and `install-journeys.ts` into one file per journey, each under about 250 lines. Pin behaviour first: the e2e test passes before and after.
- Run the e2e test in WSL only if no other ticket is running it. CI runs it on your PR.

**Blocked by:** 21

**Status:** ready-for-agent

- [ ] Admin's forms and the hub's launcher have component tests in the fast gate
- [ ] Any one journey runs alone
- [ ] No e2e source file is over about 250 lines
- [ ] The PR's CI `gate` job passes on GitHub
