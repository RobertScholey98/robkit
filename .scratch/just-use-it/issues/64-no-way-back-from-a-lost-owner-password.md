# 64: There's no way back from a lost owner password

**What to build:** Core writes the owner once, when someone claims the install (`packages/core/src/owner.ts` inserts the row, and nothing updates it). An owner who loses the password has no way in. On their machine they can start again with `docker compose down --volumes`, which deletes every app's data. In production the only way is to change core's `owner` table by hand, which nothing documents.

The docs site now says robkit can't reset the password, and to keep it safe.

**Questions for R:**

1. **How does an owner get back in?**
   - **A `robkit` command run on the server** (recommended), such as `pnpm robkit owner reset`, which clears the owner so the hub shows the set-up screen again. Whoever can run it already has the database, so it adds no new way in. Sessions and codes stay.
   - **A documented SQL statement** in the install's `docs/deploy.md`. No new code, but the owner types SQL against core's tables, which the layer rule keeps everyone else out of.
   - **Nothing.** Say so in `SECURITY.md` as a known gap.
2. **Should a signed-in owner be able to change the password in admin?** It is a different need, but the same table and the same page.

Found by the council's review of the docs site, in the round before `docs-site` merges to `main`.

**Blocked by:** none

**Status:** needs-triage

- [ ] R has answered the questions
- [ ] What R chose is built, with tests through core's public interface
- [ ] The docs site and the install's docs say how an owner gets back in
- [ ] A changeset names each published package that changed
