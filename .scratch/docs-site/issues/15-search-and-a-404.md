# 15: Search, and a 404 that helps

**What to build:** Search over every docs page, built as a static index when the site builds, with nothing sent to another origin. And a 404 page.

- A search box in the header, opened by a click or by `/`. Results show the page, the heading and the matching text, and Enter opens one.
- The index covers titles, headings, text, commands and setting names.
- It loads only when the reader opens search, so a page that never searches pays nothing.
- The 404 page says the page isn't there, and offers search and the way home.

Design both with `/ui-ux-pro-max`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Searching for a command, a setting's name and a word from a page's text each finds the right page
- [ ] Search opens, moves through results and closes from the keyboard, and returns focus to where it was
- [ ] No search script loads until the reader opens search
- [ ] A path that doesn't exist gets the 404 page, with search and a link home
- [ ] axe finds nothing on the open search or the 404 page, in either theme
- [ ] The PR's CI `gate` job passes on GitHub
