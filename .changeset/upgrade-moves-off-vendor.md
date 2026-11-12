---
"create-robkit": minor
---

`robkit upgrade` moves an install that runs the tarballs `robkit vendor` packed to the registry, in one step. Run `pnpm dlx --package create-robkit robkit upgrade` in the install: it removes the overrides that name robkit's tarballs, sets robkit's packages in the catalog to its version, installs, then removes the tarballs from `vendor/robkit`. When the registry doesn't have the robkit running, it changes nothing and says what to run.
