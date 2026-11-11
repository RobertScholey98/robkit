---
"create-robkit": patch
---

create-robkit exports `robkitCommands`, the commands `robkit` runs, so a check can hold docs to the list. It is typed `readonly string[]`, so a command added later changes no type. Importing it runs nothing.
