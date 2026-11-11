# 09: Build an app: the viewer, the guard and its tests

**What to build:** The pages a builder reads, whatever their stack, about who is looking at their app.

- **The viewer and the guard.** What `guarded()` does for an app, what a handler gets as the viewer (an owner, a guest, their roles), and what the browser sees when someone isn't signed in or may not open the app. What an app must leave to the guard: it never reads the session cookie or verifies a token itself.
- **Writes.** On the same page: why a write goes on POST, PUT, PATCH or DELETE, what the guard refuses from another origin, and how an app allows a framer.
- **Testing with a viewer.** The stacks differ, so the page shows each one's own way, with the stack switcher. React + Hono and React + Express mount their routes behind `guardedAs(viewer)` from the adapter's `/testing` entry. TanStack Start and Next.js call the plain function a handler hands the viewer to, with a viewer the same entry builds, since a server function doesn't run outside Start or Next itself. Go hands a handler its viewer with `session.WithViewer`. The page shows each stack's own test file from the templates, with ticket 05's component, and says what such a test doesn't cover: the real guard, which the whole-stack tests exercise.

Each page follows "The words" in the [PRD](../PRD.md). The sources are each stack's `AGENTS.md` (its sections on the viewer and on testing), `SECURITY.md`, and the adapters' READMEs.

**Blocked by:** 03, 05

**Status:** done

- [x] Every sample compiles, for every stack it shows
- [x] The testing page shows a test file from each of the five stacks' templates, and says for each what it doesn't cover
- [x] The pages agree with `SECURITY.md` on what the guard does and doesn't do, and the Proof names the passages checked
- [x] The page on writes names the methods the guard treats as writes, from the code
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

**What I chose.**

- Two pages in Build an app, after the five stack guides: "The viewer and the guard" (order 6) and "Testing with a viewer" (order 7). Writes and framing are sections of the first, as the ticket asks.
- "The viewer and the guard":
  - The three viewers.
  - How each stack hands one over, in a stack switcher of parts of the example app's own files.
  - Who each access rule lets in, as a list in the add wizard's words. A table would have scrolled sideways on a phone.
  - What the guard answers instead: through core for a token, to the hub to sign in, a 401 for a call, a page for a form, 404 when the rule leaves a guest out, and 503 when core can't be reached.
  - What to leave to the guard, then writes, WebSockets and framing, with each stack's way to send `frame-ancestors`.
- "Testing with a viewer" shows each stack's test file whole from the templates. For Go it shows two parts of `server_test.go`: the helper that hands a viewer over with `session.WithViewer`, and one test. Under each, it says what the test doesn't cover. A last section says what covers the guard instead.
- There are no code fences on either page. Every sample is a part of a template, read at build time.

**Proof.**

- **Samples compile.** Each sample is a template file or part of one, through `<TemplateFile>`, and a missing line fails the build. The templates compile and pass their own tests in the whole-stack tests' install checks.
- **Write methods, from the code.** `built-site.test.ts` reads the page's two paragraphs, `GET`, `HEAD`, `OPTIONS` passing and `POST`, `PUT`, `PATCH`, `DELETE` as writes. It then sends each, and a made-up `PROPFIND`, to `requestGuard` from `@robkit/session` from another app's origin. The guard served the first three and answered the rest 403. It was red before the page existed. `isFromAnotherOrigin` in `packages/session/src/guard-http.ts`, and `go/session/http.go`, treat every method but GET, HEAD and OPTIONS as a write.
- **`SECURITY.md` passages checked against the pages:**
  - "No sibling app can write as the viewer": the methods, the 403 before the session is read, a GET with side effects, and the WebSocket the guard never sees.
  - "No guarded app can be framed from another origin": `SAMEORIGIN` on what the guard lets through, `frame-ancestors` over `X-Frame-Options`, Next dropping the app's own, and the built files carrying no framing header.
  - "Each app holds only its own token": no other app or core accepts the app's token.
  - "Built files are public."
- **Who gets in** is `outcomes` in `packages/guard/src/guard.ts`. What the guard answers is `respond` and `decide` in `packages/session/src/request-guard.ts`.
- **What each test doesn't cover** is from each stack's `AGENTS.md` "Testing" section and each adapter's README. "What covers the guard" is from `conformance.ts`, which the four adapters' tests and Go's run, and from `cross-origin-journey.ts` and `framing-journey.ts` in the whole-stack tests.
- **Browser and checks.** `build-an-app.browser.test.ts`: axe finds nothing on either page at 375 and 1280 px in both themes, and neither page is wider than 375 px on a phone. On Windows, the site's build, lint, typecheck, all 173 tests with 100% coverage, `pnpm knip`, Prettier and the glossary check pass. I looked at both pages at 1280 px light.

**For the next tickets.**

- `to="^}"` ends a part on a line that starts with `}`, which a Go function needs.
- 4-space indents inside a `<Fragment>` render as prose, not code.
- The glossary avoids "framework" and "middleware". Say "stack", or name the call, such as `app.use`.
- A table with three or more columns scrolls sideways at 375 px. The site has no table style yet. Use a list, or add one to `DESIGN.md` first.
- The site now depends on `@robkit/session` for that test.

**What milestone 4 will change on these pages.**

- Ticket 27 of "Just use it" finishes the templates, each stack's page and test among them. A part whose first or last line changes fails the build, so this page names the file to fix.
- Ticket 27 also notes that `next/image` can't show a file from `public` behind the guard. If it changes how Next serves `public`, check the line on built files here.
