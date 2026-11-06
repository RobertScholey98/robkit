---
"@robkit/input": patch
"@robkit/session": patch
"@robkit/core": patch
"@robkit/dev": patch
"create-robkit": patch
---

The manifest has one name in code.

- `@robkit/input/manifest`: `AppDeclaration` is now `AppManifest`, `readAppDeclaration` is `readAppManifest`, `appDeclarationJson` is `appManifestJson`, `DeclaredAccess` is `ManifestAccess`, and `DeclaredApp` and `readDeclaredApp` are `ListedApp` and `readListedApp`.
- `@robkit/dev`: what it reads from an app's `package.json` is `AppManifestFile`, from `appManifestFileIn`, and its `declares` field, like an `App`'s, is now `manifest`.
