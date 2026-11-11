# 20: Reference: every command

**What to build:** One reference page for `npm create robkit` and one for the `robkit` command an install runs. Each command has what it does in a sentence, its arguments and options with their defaults, one example of what it prints, and what makes it refuse.

- **Public usage only.** The pages cover what the usage text shows. `robkit upgrade --finish` is the handover between upgrade's two steps, which an owner never types, and stays off the page.
- **Held to the usage text.** Ticket 04 exported the list of commands. This ticket's test reads each command's usage and fails where a command or an option is in one and not the other. If the options aren't exported yet, export them the same way.
- **Options are checked where they are read.** For each option, check its value and its default against the code that parses it, and name the place in the Proof.

Milestone 4 changes `robkit deploy` and `robkit check` (tickets 22 and 23 of "Just use it"). The test shows what moved when that lands.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Every command and option in the usage text of `create-robkit` and `robkit` is on a page, and nothing is on a page that the usage text lacks
- [ ] A command or option added to the usage text and not to the page fails a test, and so does the reverse
- [ ] Each command's page gives an example of its output and what makes it refuse, from the code
- [ ] The command's source files are among the turbo inputs of the test
- [ ] The PR's CI `gate` job passes on GitHub
