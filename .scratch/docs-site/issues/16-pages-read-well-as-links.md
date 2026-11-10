# 16: Every page reads well as a link, to people and to agents

**What to build:** What a page carries for whoever, or whatever, fetches it.

- **For a link preview.** Each page has a title, a description from its front matter, a canonical address and a preview image. The image is made when the site builds, from the page's title, in the site's design.
- **For a crawler.** A sitemap and a `robots.txt`.
- **For an agent.** The build writes each docs page as Markdown at the page's address with `.md` on the end, and an `llms.txt` at the root that lists every page with its description.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A page without a description fails the build with a message that names the file
- [ ] Each page's HTML has its title, description, canonical address and preview image
- [ ] The sitemap lists every page and nothing else
- [ ] Each docs page's Markdown is at its address plus `.md`, and holds the page's text and code
- [ ] `llms.txt` lists every docs page, and a new page appears there with no other edit
- [ ] The PR's CI `gate` job passes on GitHub
