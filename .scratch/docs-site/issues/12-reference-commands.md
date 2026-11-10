# 12: Reference: every command

**What to build:** One reference page for `npm create robkit` and one for the `robkit` command an install runs: add, migrate, upgrade, check, deploy, vendor and the rest its usage text lists. Each command has what it does in a sentence, its arguments and options, what it prints, and what makes it refuse.

A test reads the pages and the commands' own usage text, and fails where a command or an option is on one and not the other.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Every command and option in the usage text of `create-robkit` and `robkit` is on a page
- [ ] A command or option added to the usage text and not to the page fails a test, and so does one on the page the command doesn't have
- [ ] Each command's page says what makes it refuse, from the code
- [ ] The PR's CI `gate` job passes on GitHub
