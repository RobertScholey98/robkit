# 61: The port tests lease the ports they expect to be free

**What to build:** `checks.test.ts` in `@robkit/dev` has a test, "takes the first port after the proxy's that no app holds". It asks the OS for any port, calls it the proxy's, and expects `portForNewApp` to answer the port three after it. The test holds only the first of those ports. The OS picks every other test's port from the same range, so another test's server can hold the one it expects.

That happened in CI on 2026-11-11, in the `check` job of pull request 139, which changes a test time limit in another package:

```text
FAIL  unit  src/checks.test.ts > portForNewApp > takes the first port after the proxy's that no app holds
AssertionError: expected 41999 to be 41998 // Object.is equality
```

Two more tests in the file expect a port they don't hold to be free: "passes over a port something else listens on", and "says a port something listens on is taken, and a free one isn't".

- **A test leases a port it expects to be free.** `freePortBlock` in `@internal/test-postgres` leases consecutive ports below the OS's range, and no other test process on the machine gets them.

**Blocked by:** none

**Status:** done

- [x] The failure is reproduced before the fix, shown by the same assertion with another server on the port the test expects
- [x] The three tests lease each port they expect to be free
- [x] `checks.test.ts` passes
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, 2026-11-11

- I reproduced it in WSL with a copy of the test that starts a second server on the port three after the proxy's. It failed with "expected 42185 to be 42184", the same assertion as in CI.
- The two `portForNewApp` tests lease a block of four ports and hold the ones their case needs. The `isTaken` test takes its free port from `freePort`, which leases one.
- A test still takes a port from the OS when it only needs one that is held, since nobody else can get a port it holds.
- `portForNewApp` and `isTaken` don't change. Only the tests counted on a port they didn't hold.
- No changeset. Only a test file changed.
