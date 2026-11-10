---
"create-robkit": patch
---

`robkit add` copies a file in an install's own `robkit/templates/<stack>` that isn't UTF-8 text, such as an image, byte for byte. It used to read it as text and spoil it.
