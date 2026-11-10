---
"create-robkit": patch
---

`--link` links, and `robkit vendor` packs, the robkit packages an install's packages run on as well as the ones its manifests name. An install whose manifests don't name `@robkit/provision`, which arrives behind `@robkit/core`, no longer asks npm for it.
