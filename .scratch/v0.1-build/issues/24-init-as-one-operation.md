# 24: Init is one operation

**What to build:** `npm create robkit` runs four steps in order: generate the install, write it, install dependencies and initialise git. Today only the command line knows that order, and the whole-stack test copies it without git. After this ticket, one exported init operation takes the choices and a folder to a finished install. The command line and the whole-stack test both call it, so CI makes its installs exactly as a user's init does.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The command line and the whole-stack test call the same init operation
- [ ] Whether to install and initialise git is a parameter of that operation, with the same defaults as today
- [ ] The printed next steps and the printed repeat command are unchanged, and the existing command-line tests pass

Source: the architecture review of 2026-11-03 (see the map)
