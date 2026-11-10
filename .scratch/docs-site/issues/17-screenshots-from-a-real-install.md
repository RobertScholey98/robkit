# 17: Screenshots taken from a real install

**What to build:** A script that starts an install made from this checkout, signs in as its owner, and takes the screenshots the site uses: the hub's sign-in, the launcher with a few apps, an app, and admin's access codes and roles. In light and dark, at one size. The home page and the quickstart show them.

The screenshots are files in the site, taken by a command a contributor runs and commits. The gate doesn't retake them, since they need Docker. The script is the record of how they were made, so they can be retaken when the hub changes.

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [ ] One command makes every screenshot from an install it starts and stops itself, and `CONTRIBUTING.md` names it
- [ ] Each screenshot on the site has a text alternative that says what it shows
- [ ] The screenshots follow the reader's theme
- [ ] The home page stays under the script size ticket 02 recorded, and its images don't shift the layout as they load
- [ ] The PR's CI `gate` job passes on GitHub
