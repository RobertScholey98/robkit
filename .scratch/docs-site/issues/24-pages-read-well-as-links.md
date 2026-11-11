# 24: Every page reads well as a link, to people and to agents

**What to build:** What a page carries for whoever, or whatever, fetches it.

- **For a link preview.** Each page has a title, a description from its front matter, a canonical address and a preview image. One image serves the whole site, designed with `/ui-ux-pro-max`.
- **For a crawler.** A sitemap and a `robots.txt` that names it. The sitemap leaves out the 404, the samples page and stubs.
- **For an agent.** The build writes each docs page as Markdown, at the page's address with `.md` in place of its trailing slash, and an `llms.txt` at the root that lists every page with its description. The Markdown is what a reader sees, not the page's source: a stack switcher becomes each stack's sample under its name, a file shown from the templates becomes that file's text in a fence, a callout and the pre-release line become plain text, and the glossary's and the gaps' built lists are written out. No import, JSX or expression is left in it.
- The link check from ticket 03 reads the Markdown files' links too.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] A page without a description fails the build with a message that names the file
- [ ] Each page's HTML has its title, description, canonical address and the preview image
- [ ] The sitemap lists every page but the 404, the samples page and stubs, and `robots.txt` names the sitemap
- [ ] The Markdown of a page that uses a stack switcher, a template file, a callout and the pre-release line holds each one's text, every stack under its name, and no import or JSX
- [ ] `llms.txt` lists every docs page, and a new page appears there with no other edit
- [ ] The PR's CI `gate` job passes on GitHub
