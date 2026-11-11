# 08: Screenshots taken from a real install

**What to build:** A script that starts an install made from this checkout, signs in as its owner, and takes the screenshots the site uses: the hub's sign-in, the launcher with a few apps, an app, and admin's access codes and roles. The home page and the quickstart show them.

- **Light only.** The hub and admin have no dark theme: the install's `theme.css` defines one, and nothing applies it. A dark screenshot would show something an install doesn't do. On the site's dark theme the screenshots sit in a frame that makes that plain.
- **The same every time.** The script makes its own apps, codes and roles with fixed names, so two runs give the same pictures. No secret is in a picture: the access codes shown are made for the picture and die with the install.
- **Files in the site.** The screenshots are committed, taken by a command a contributor runs. The gate doesn't retake them, since they need Docker. Beside them a small file records the commit and the command that made them.
- **Reuse.** The whole-stack tests already make an install, start it and sign in. Use their helpers where the package graph allows, and add the edge it needs.

The hub changes in milestone 4 of "Just use it" (its ticket 27). Ticket 26 runs this script again after that.

**Blocked by:** 06, 07

**Status:** ready-for-agent

- [ ] One command makes every screenshot from an install it starts and stops itself, and `CONTRIBUTING.md` names it
- [ ] Two runs of the command give the same pictures
- [ ] The record beside the screenshots names the commit and the command
- [ ] Each screenshot on the site has a text alternative that says what it shows
- [ ] The home page stays under the script size ticket 02 recorded, and its images don't shift the layout as they load
- [ ] The PR's CI `gate` job passes on GitHub
