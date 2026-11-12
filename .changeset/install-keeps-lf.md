---
"create-robkit": patch
---

A new install has a `.gitattributes` that keeps text files LF, so a checkout made by git on Windows can still run the pre-commit hook and pass `pnpm format:check`. For an install made before this, add a `.gitattributes` at its root with these two lines, then run `git add --renormalize .` and commit:

```text
* text=auto eol=lf
*.tgz binary
```
