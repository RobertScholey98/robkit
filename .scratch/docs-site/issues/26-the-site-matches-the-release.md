# 26: The site matches the release it describes

**What to build:** The site is written while milestone 4 of "Just use it" changes robkit beside it. Before `docs-site` merges to `main`, the site has to describe the code that will be released, with no known mismatch left.

- **Merge `main` into `docs-site`**, with milestone 4 in it.
- **Let the checks speak first.** The command reference, the settings reference, the package pages, the file-list tests and the imported template files fail or change by themselves where robkit moved. Fix each.
- **Then read what no check holds.** Run the script from ticket 03 over the files milestone 4 changed, and read each page it prints against the code. Each content ticket's comments list what milestone 4 would change on its pages: go through those lists.
- **Take the screenshots again** with ticket 08's command, since the hub changed.
- **No stub is left.**
- **Every page, in a browser.** Run axe over every built page, in light and dark, at 375 and 1280 pixels wide.
- **Record the commit** of `main` the site was read against, in this ticket's comments. The second council round reviews the site at the commit this ticket ends on.

**Blocked by:** 25; every ticket before this one, and milestone 4 of "Just use it" merged to `main`

**Status:** ready-for-agent

- [ ] `docs-site` holds `main` with milestone 4 merged, and CI's `gate` passes on it
- [ ] Each item in the content tickets' "what milestone 4 will change" lists is done or shown not to apply, and the Proof goes through them
- [ ] The screenshots were retaken, and their record names the new commit
- [ ] The stub count is zero, and a test fails on a stub from now on
- [ ] axe finds nothing on any page, in either theme, at either width
- [ ] The ticket's comments name the commit of `main` the site describes
- [ ] The PR's CI `gate` job passes on GitHub
