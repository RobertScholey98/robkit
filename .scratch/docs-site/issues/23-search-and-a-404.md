# 23: Search, and a 404 that helps

**What to build:** Search over every docs page, built as a static index when the site builds, with nothing sent to another origin. And a 404 page.

- A search box in the header, opened by a click or by `/`. The key does nothing while the reader is typing in a field. Results show the page, the heading and the matching text, and Enter opens one. An empty box and a search that finds nothing each say so.
- The index covers titles, headings, text, commands and setting names. It leaves out stubs and the samples page.
- **A library is fine** if it runs from the site's own files. Only a small handler for the button and the key loads with the page. The search code and the index load when the reader first opens search.
- The 404 page says the page isn't there, and offers search and the way home. Test it with a path several folders deep, from the local static server. What a host does with a missing path belongs to the hosting work.

Design both with `/ui-ux-pro-max`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Searching for a command, a setting's name and a word from a page's text each finds the right page
- [ ] Search opens, moves through results and closes from the keyboard, and returns focus to where it was
- [ ] `/` typed into a field types a slash
- [ ] Until the reader opens search, the page fetches no search code and no index, and stays under the size ticket 02 recorded
- [ ] A path that doesn't exist gets the 404 page, with search and a link home
- [ ] axe finds nothing on the open search or the 404 page, in either theme
- [ ] The PR's CI `gate` job passes on GitHub
