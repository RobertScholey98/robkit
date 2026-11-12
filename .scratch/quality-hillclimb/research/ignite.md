# Ignite quality report

Commit: e829d2f922c5568a59a77bfb6232aeb500be3f13. Scope: static inspection of `src/`, `bin/ignite`, CLI integration and unit tests, `boilerplate/app/`, Expo Router entry files, generator EJS templates, boilerplate tests and Maestro flows, root and boilerplate configuration, `.circleci/`, `.github/`, READMEs and contributor/concept documentation. Native project files and binary assets were inventoried but not audited in depth. Dependencies were not installed, tests were not executed, and external documentation links were not fetched. Scores combine the CLI and its generated app; differences are called out below. The clone is shallow, so history cannot establish maintenance trends.

## Scores

| # | Category | Score | One-line reason |
| --- | --- | --- | --- |
| 1 | Module boundaries | 5/10 | Clear command/tool and app folders, but no enforced domain-layer direction and oversized coordinating modules (`src/commands/new.ts:158`, `.dependency-cruiser.js:3`). |
| 2 | Public API design | 7/10 | Good CLI feedback, typed component props and generation results, with some permissive and misleading interfaces (`src/commands/generate.ts:129`, `boilerplate/app/components/Text.tsx:16`, `boilerplate/app/utils/storage/index.ts:39`). |
| 3 | Type safety at the edges | 4/10 | Strict generated app, permissive CLI and unchecked JSON/YAML/HTTP shapes (`tsconfig.json:9`, `boilerplate/tsconfig.json:11`, `src/tools/generators.ts:189`). |
| 4 | Naming and domain language | 7/10 | Commands and template folders map well to concepts, with stale terminology in help and tests (`src/commands/generate.ts:45`, `src/tools/generators.ts:82`, `test/vanilla/ignite-generate.test.ts:49`). |
| 5 | Simplicity | 5/10 | Six CLI runtime dependencies and direct generation, offset by large handlers, demo machinery and app dependencies (`package.json:50`, `src/commands/new.ts`, `src/tools/generators.ts`). |
| 6 | Consistency | 6/10 | Shared lint config and themed components establish a style, but templates, typing and failure conventions diverge (`.eslintrc.js:1`, `boilerplate/ignite/templates/component/NAME.tsx.ejs:22`, `src/tools/spawn.ts:18`). |
| 7 | Error handling | 4/10 | Tagged API problems and helpful CLI diagnostics coexist with swallowed failures and false success (`boilerplate/app/services/api/apiProblem.ts:3`, `src/tools/generators.ts:889`, `boilerplate/app/utils/storage/index.ts:55`). |
| 8 | Testing | 7/10 | Real CLI-to-generated-app coverage, but slow setup, snapshot coupling and no checked-in CI device journey (`test/vanilla/ignite-new.test.ts:106`, `test/_test-helpers.ts:15`, `.circleci/config.yml:60`). |
| 9 | Keeping standards up | 7/10 | CI, import restrictions, release automation and house-style generators are substantive; raw generation can still drift (`.circleci/config.yml:62`, `boilerplate/.eslintrc.js:33`, `boilerplate/ignite/templates/screen/NAMEScreen.tsx.ejs:1`). |
| 10 | Nice to work in as a human | 8/10 | Strong local CLI loop, runnable boilerplate, docs and examples, with some stale guidance and substantial mobile setup (`bin/ignite:18`, `docs/contributing/Tour-of-Ignite.md:81`, `.github/CONTRIBUTING.md:20`). |

## Measurements

All commands below ran from the clone, using PowerShell. No install, build, test, network operation or repository mutation was performed. `git status --short` was empty after inspection. Report output is outside the clone.

| Measurement | Result | Method / command |
| --- | --- | --- |
| Commit | `e829d2f922c5568a59a77bfb6232aeb500be3f13` | `git rev-parse HEAD` |
| History available | Shallow; one commit visible | `git rev-parse --is-shallow-repository`; `git log -3 --oneline` |
| Package manifests | 2, CLI and boilerplate; not a multi-package workspace | `Get-ChildItem -Recurse -Filter package.json` |
| CLI dependencies | 6 runtime, 24 development | `Get-Content package.json -Raw \| ConvertFrom-Json`; count dependency properties |
| Boilerplate dependencies | 33 runtime, 25 development | Same property count for `boilerplate/package.json` |
| CLI non-test TS/TSX | 29 files, 4,527 lines | Recursive file enumeration of `src`, exclude names matching `\.(test\|spec)\.`, count `Get-Content` lines |
| App non-test TS/TSX | 94 files, 13,232 lines | Same enumeration for `boilerplate/app` and `boilerplate/src`; excludes EJS, test setup, declarations and app.config.ts |
| CLI lexical escape indicators | `any`: 21; `as`: 42; `@ts-ignore`: 0; `@ts-expect-error`: 0; `eslint-disable`: 4 | `[regex]::Matches($all, $pattern).Count`, patterns `\bany\b`, `\bas\b`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` over the CLI file set |
| App lexical escape indicators | `any`: 31; `as`: 122; `@ts-ignore`: 1; `@ts-expect-error`: 2; `eslint-disable`: 17 | Same patterns over the app file set |
| Test files | CLI unit: 3; CLI integration: 5; boilerplate: 4 | Recursive filename match `\.(test\|spec)\.[tj]sx?$` in `src`, `test`, `boilerplate` |
| Device flows supplied | 2 entry flows, 2 shared flows | `rg --files --hidden boilerplate/.maestro` |
| Documentation | 66 `.md` files under `docs` | `Get-ChildItem docs -Recurse -Filter *.md` |
| Ownership / agent / hooks inventory | No tracked CODEOWNERS, AGENTS.md, CLAUDE.md or Husky hook files found | `rg --files --hidden -g '*AGENTS*' -g '*CLAUDE*' -g '*husky*' -g '*CODEOWNERS*'`; package scripts also have no hook installation step |

The token counts are deliberately lexical, not AST counts of unsafe constructs. They include comments, string content and import aliases; in particular `as` is not an assertion count and `any` is not an exact explicit-any type count. Concrete unsafe uses are cited in category 3. No claim about test pass status or actual execution speed follows from this inspection. A Python counting attempt failed because Python was unavailable; PowerShell produced the measurements above.

Largest non-test CLI files:

| File | Lines |
| --- | ---: |
| `src/commands/new.ts` | 1,078 |
| `src/tools/generators.ts` | 972 |
| `src/tools/react-native.ts` | 427 |
| `src/tools/markup.ts` | 296 |
| `src/tools/packager.ts` | 258 |

Largest app files are primarily demo translations: `boilerplate/app/i18n/demo-fr.ts` (471), `demo-es.ts` (469), `demo-hi.ts` (468), `demo-ar.ts` and `demo-ja.ts` (464 each). This is data volume, not equivalent control-flow complexity. Larger executable examples include `boilerplate/app/screens/DemoPodcastListScreen.tsx` (386), `boilerplate/app/screens/DemoShowroomScreen/demos/DemoToggle.tsx` (354), and `boilerplate/app/components/Header.tsx` (332). Counts came from `Get-Content`, sorted by line count.

Additional evidence searches: `rg --files` for layout; `rg --files --hidden` for configuration and automation; `rg -n 'catch|process.exit|throw |validate|boolFlag' src/commands/new.ts src/tools/spawn.ts src/tools/validations.ts`; `rg -n 'prettier|lint|format|destinationDir|ejs.render' src/tools/generators.ts`; `rg -n '@ts-ignore|@ts-expect-error' boilerplate/app`. Numbered excerpts were read with `Get-Content` and a line counter.

## 1. Module boundaries - 5/10

What they do well:
- Gluegun setup is small and delegates to discovered commands (`src/cli.ts:4`). Commands and reusable tools are separate folders. Generate coordinates input and reporting around the generation engine (`src/commands/generate.ts:19`, `src/tools/generators.ts:260`).
- The app separates API services, context, screens, components, navigation, configuration and theme. Navigation types have their own file (`boilerplate/app/navigators/navigationTypes.ts:19`), and the API service has an identifiable entry (`boilerplate/app/services/api/index.ts:35`).
- Dependency-cruiser rejects unresolved imports, imports from tests and production imports of development dependencies (`.dependency-cruiser.js:74`, `:97`, `:111`; `boilerplate/.dependency-cruiser.js:104`, `:118`).

Weaknesses:
- Cruiser does not encode an app layer hierarchy or prevent tools importing commands. Circularity is only a warning (`.dependency-cruiser.js:5`, `boilerplate/.dependency-cruiser.js:12`). Neither tsconfig defines package/project-reference boundaries.
- The 1,078-line new command owns prompts, dependency installation, cache, file edits, formatting and exits. The 972-line generator module combines text templates, YAML patching and image pipelines (`src/commands/new.ts:158`, `src/tools/generators.ts:260`, `:573`, `:846`). Small entry files do not make these modules understandable through their interfaces alone.
- Generate imports its options type from the new command, coupling unrelated command modules (`src/commands/generate.ts:3`, `:115`).

Worth copying into robkit:
- Gate production dependency classification and test-import boundaries with dependency analysis, then add robkit-specific forbidden layer edges rather than relying on generic rules alone.

## 2. Public API design - 7/10

What they do well:
- The executable is the primary published interface, with two intentional binary names and an explicit package file allowlist (`package.json:5`, `:13`). This is a CLI product, not a library that needs many package exports.
- Generate returns separate written, overwritten and existing file lists; the command explains skipped files and the overwrite flag (`src/tools/generators.ts:260`, `src/commands/generate.ts:129`).
- Component props expose named presets, typed theme-derived sizes/weights and typed translation keys (`boilerplate/app/components/Text.tsx:12`). Navigation screen props constrain route names (`boilerplate/app/navigators/navigationTypes.ts:27`).

Weaknesses:
- `TextProps` permits text, tx and children simultaneously; implementation silently prioritizes them (`boilerplate/app/components/Text.tsx:16`, `:63`). This is convenient but not misuse-proof.
- `load<T>` promises caller-selected types without verification and can return raw strings as T (`boilerplate/app/utils/storage/index.ts:39`).
- Generator options require derived naming fields and subdirectory even for simple calls; flags also pass through a broad options type from another command (`src/tools/generators.ts:248`, `src/commands/generate.ts:115`).

Worth copying into robkit:
- Return structured file outcomes from generation and make overwrite recovery instructions part of the CLI contract.

## 3. Type safety at the edges - 4/10

What they do well:
- The generated app enables strict mode, noImplicitAny and noImplicitReturns (`boilerplate/tsconfig.json:11`).
- New validates package manager names at runtime using an unknown-to-union type predicate (`src/commands/new.ts:341`); project name, bundle and path validations have dedicated functions (`src/tools/validations.ts:40`, `:73`, `:105`).
- Typed navigation and theme styles constrain everyday app code (`boilerplate/app/navigators/navigationTypes.ts:27`, `boilerplate/app/components/Text.tsx:96`).

Weaknesses:
- CLI tsconfig explicitly disables noImplicitAny and does not enable strict mode; even argv is untyped (`tsconfig.json:9`, `src/cli.ts:4`). Lint disables explicit-any and TypeScript-comment bans (`boilerplate/.eslintrc.js:19`).
- YAML front matter is parsed directly into dynamically accessed fields without a runtime schema (`src/tools/generators.ts:189`, `:327`). Image generator flags include an arbitrary-any index signature (`src/tools/generators.ts:10`).
- HTTP response typing supplies an expectation, not validation: episodes are mapped/spread without checking their fields (`boilerplate/app/services/api/index.ts:59`, `:70`). Storage JSON casts to an unconstrained T, including a raw-string fallback (`boilerplate/app/utils/storage/index.ts:39`).
- Escape hatches remain in navigation and devtools (`boilerplate/app/navigators/navigationUtilities.ts:180`, `boilerplate/app/devtools/ReactotronConfig.ts:71`).

Worth copying into robkit:
- Use runtime predicates for enumerated CLI choices, but parse all flags/front matter into a validated model before generation. Keep the CLI as strict as its output.

## 4. Naming and domain language - 7/10

What they do well:
- User-facing commands map to files such as new, generate, rename, doctor and remove-demo (`src/commands/`). Local generator folder names map directly to command names (`docs/concept/Generator-Templates.md:13`, `src/tools/generators.ts:238`).
- Names are normalized once into casing variants; duplicate Screen suffixes are removed before generating names (`src/commands/generate.ts:45`, `src/tools/generators.ts:267`).
- `$` style names distinguish theme/style values, and the convention appears in docs and templates (`docs/concept/Styling.md:13`, `boilerplate/ignite/templates/component/NAME.tsx.ejs:31`).

Weaknesses:
- Generator help still uses model examples although the shipped code templates are component, screen and navigator (`src/tools/generators.ts:82`, `:92`, `boilerplate/ignite/templates/`).
- Tests describe patching component index exports while expecting the index to be absent (`test/vanilla/ignite-generate.test.ts:49`, `:98`). Legacy CLI names remain centralized in `src/types.ts:3`.
- The code-tour claim that primary types mostly come from types.ts does not describe the direct Gluegun imports in generate (`docs/contributing/Tour-of-Ignite.md:55`, `src/commands/generate.ts:1`).

Worth copying into robkit:
- Make generator folder names and command names identical, and centralize file/name casing rules in the rendering engine.

## 5. Simplicity - 5/10

What they do well:
- Only six direct runtime dependencies power the CLI (`package.json:50`). EJS files render directly into output rather than going through a large plugin system (`src/tools/generators.ts:309`).
- The boilerplate is an ordinary runnable app, and generators are ordinary local files (`boilerplate/package.json:6`, `boilerplate/ignite/templates/`).

Weaknesses:
- New and generators account for 2,050 of 4,527 non-test CLI source lines. Understanding init requires following installation/cache, native renaming, demo patching and Expo Router conversion through the same command (`src/commands/new.ts:3`, `:23`, `:709`).
- There are two template representations: committed EJS files and Expo Router templates embedded in TypeScript strings (`boilerplate/ignite/templates/screen/NAMEScreen.tsx.ejs`, `src/tools/react-native.ts:234`).
- The app starts with 33 runtime dependencies plus extensive demonstrations and translation data. Useful teaching material still adds removal/maintenance machinery (`src/commands/new.ts:4`, `boilerplate/app/screens/DemoShowroomScreen/`).
- Several directory helpers simply wrap another helper/current working directory, making a generation trace longer (`src/tools/generators.ts:168`).

Worth copying into robkit:
- Preserve a runnable template as the source of truth, with one direct render-and-write path and explicit data-driven variations.

## 6. Consistency - 6/10

What they do well:
- Root ESLint reuses the boilerplate configuration; formatting, import groups and custom component imports have shared rules (`.eslintrc.js:1`, `boilerplate/.eslintrc.js:16`, `:33`, `:68`).
- Templates emit the same named components, props, theme hook and typed `$` styles used by the app (`boilerplate/ignite/templates/component/NAME.tsx.ejs:9`, `boilerplate/app/components/Text.tsx:59`).
- Boolean option normalization is shared (`src/tools/flag.ts:20`), and new uses a common package-manager abstraction (`src/commands/new.ts:715`).

Weaknesses:
- The component EJS includes a terminal semicolon, lacks configured import grouping and orders local imports differently from the shared lint rule (`boilerplate/ignite/templates/component/NAME.tsx.ejs:4`, `:22`; `boilerplate/.eslintrc.js:68`). Raw generation writes it unchanged (`src/tools/generators.ts:353`).
- Strictness differs between CLI and app; command imports mix direct Gluegun imports and central type re-exports (`tsconfig.json:9`, `boilerplate/tsconfig.json:11`, `src/commands/new.ts:38`, `src/commands/generate.ts:1`).
- Failure handling mixes printed warnings, process exits, rejected strings and tagged result unions (`src/tools/generators.ts:329`, `src/commands/new.ts:351`, `src/tools/spawn.ts:18`, `boilerplate/app/services/api/apiProblem.ts:3`).

Worth copying into robkit:
- Share lint and formatting policy between scaffolder and output; validate unmodified generator output under that policy.

## 7. Error handling - 4/10

What they do well:
- HTTP failures have a useful discriminated union, including temporary connectivity failures and authorization cases (`boilerplate/app/services/api/apiProblem.ts:3`, `:46`).
- Invalid package-manager errors list valid choices; missing-generator errors explain installation or spelling fixes (`src/commands/new.ts:344`, `src/tools/generators.ts:43`).
- Init failure reports the error and attempts to gather doctor diagnostics with a fallback if that fails (`src/commands/new.ts:1006`). The app provides an error boundary and reset UI (`boilerplate/app/screens/ErrorScreen/ErrorBoundary.tsx:29`, `:65`).

Weaknesses:
- Splash rendering catches and discards all image failures; the aggregate result only indicates whether any output succeeded (`src/tools/generators.ts:875`, `:889`, `:971`). Partial generation loses its cause.
- Storage remove and clear silently catch failures. More seriously, save ignores saveString's false result and returns true, so a failed write can look successful (`boilerplate/app/utils/storage/index.ts:25`, `:55`, `:69`).
- Malformed front matter reports a warning and returns ordinary file outcomes, without a failure tag (`src/tools/generators.ts:327`).
- runGenerator does not return/await the generation promise; generate's command does not await runGenerator either. Async error propagation is therefore not explicit through the command contract (`src/tools/generators.ts:15`, `:39`, `src/commands/generate.ts:13`). Spawn can reject with a string or Error (`src/tools/spawn.ts:18`).

Worth copying into robkit:
- Adopt the tagged API-problem approach for generator failures too, preserving operation/path/cause and partial output details.

## 8. Testing - 7/10

What they do well:
- Integration tests call `node bin/ignite`, inspect generated files and command output, and clean temporary directories (`test/_test-helpers.ts:12`, `:50`, `test/vanilla/ignite-new.test.ts:35`, `:44`).
- Tests generate components/screens/assets and run the resulting app's tests, lint, compile and dependency analysis. A separate test covers Expo Router conversion (`test/vanilla/ignite-new.test.ts:124`, `:254`, `test/vanilla/ignite-new-expo-router.test.ts:33`, `:74`).
- There are focused unit tests for markup, package-manager behavior and React Native helpers (`src/tools/markup.test.ts`, `src/tools/packager.test.ts`, `src/tools/react-native.test.ts`). Boilerplate examples include observable Text rendering and API-problem/storage tests (`boilerplate/app/components/Text.test.tsx:13`, `boilerplate/app/services/api/apiProblem.test.ts`, `boilerplate/app/utils/storage/storage.test.ts`).
- Two supplied Maestro journeys cover login and favorite-podcast interaction (`boilerplate/.maestro/flows/Login.yaml`, `boilerplate/.maestro/flows/FavoritePodcast.yaml:9`).

Weaknesses:
- The integration path installs real dependencies, uses shell processes and permits ten-minute test timeouts, so the main feedback path is not lightweight (`test/vanilla/ignite-new.test.ts:35`, `test/_test-helpers.ts:15`, `:87`). No timings were measured.
- Full generated-source and terminal-output snapshots couple tests to formatting and wording (`test/vanilla/ignite-generate.test.ts:52`, `:59`).
- The generated app has only four test files; Text has one basic rendering assertion. The checked-in CircleCI job does not launch Maestro or build/run either native app (`boilerplate/app/components/Text.test.tsx:12`, `.circleci/config.yml:22`). Native end-to-end flows exist but are not an automated gate in this checkout.

Worth copying into robkit:
- Test through the shipped binary, then run generated projects' own checks after adding code. Keep smaller unit checks available separately.

## 9. Keeping standards up - 7/10

What they do well:
- CircleCI runs formatting, lint, CLI typecheck and dependency analysis before Jest; publication depends on the tests job (`.circleci/config.yml:60`, `:109`). Semantic-release derives releases and updates the manifest (`package.json:84`).
- Lint enforces house components over raw React Native Text/Button/TextInput, safe-area imports, named React imports, import grouping and no Reactotron in production (`boilerplate/.eslintrc.js:33`, `:61`, `:68`). This encodes actual app conventions rather than just syntax preferences.
- Local generator templates encode props, theme usage and file destinations. Screen front matter patches a named navigation-type anchor (`boilerplate/ignite/templates/component/NAME.tsx.ejs:1`, `boilerplate/ignite/templates/screen/NAMEScreen.tsx.ejs:1`, `boilerplate/app/navigators/navigationTypes.ts:24`). These help additions retain the app's house style.
- Init runs lint to format its modifications, with a Prettier fallback when dependencies are not installed (`src/commands/new.ts:835`). Integration tests check generated projects and generator output (`test/vanilla/ignite-new.test.ts:254`).
- The PR template requests updated docs and a manually generated app (`.github/PULL_REQUEST_TEMPLATE.md:19`).

Weaknesses:
- Root lint covers src/test, and root typecheck excludes boilerplate; generated-app integration tests supply that coverage indirectly (`package.json:34`, `tsconfig.json:17`, `test/vanilla/ignite-new.test.ts:254`).
- `lint` in generated apps uses autofix. The generator test snapshots preserve a semicolon in output, and the integration test expects a diff after lint, so the gate does not guarantee raw generator output already meets house style (`boilerplate/package.json:15`, `test/vanilla/ignite-generate.test.ts:78`, `test/vanilla/ignite-new.test.ts:257`, `:260`). Root format targets listed source extensions, not `.ejs` (`package.json:31`).
- Cycles are warnings, explicit any and TypeScript comment bans are disabled, and no checked-in ownership, agent rules, active hooks or coverage ratchet were found (`.dependency-cruiser.js:5`, `boilerplate/.eslintrc.js:19`, `package.json:25`). Husky is a development dependency, not evidence of an installed hook (`package.json:74`).
- The source tour says lint configuration lives in package.json despite actual standalone config files, showing documentation is not mechanically synchronized (`docs/contributing/Tour-of-Ignite.md:19`, `.eslintrc.js:1`). Branch protection and external review-bot settings cannot be established from the clone.

Worth copying into robkit:
- Generate route registrations and types together using stable anchors, and make raw rendered templates pass non-fixing lint/typecheck in CI.
- Use import restrictions with actionable replacement messages to enforce the generated app's architectural conventions.

## 10. Nice to work in as a human - 8/10

What they do well:
- Development invokes TypeScript directly through the same binary; watch/build scripts are available when desired (`bin/ignite:18`, `package.json:26`, `:30`, `:44`).
- Contributor instructions show how to exercise a local checkout's new and generate commands, and tests have descriptive command-failure logs (`docs/contributing/Contributing-To-Ignite.md:13`, `test/_test-helpers.ts:144`).
- The source tour describes commands, tools, tests and the runnable boilerplate. There are 66 Markdown docs plus component examples and an interactive showroom in the app (`docs/contributing/Tour-of-Ignite.md:49`, `:73`, `:81`, `boilerplate/app/screens/DemoShowroomScreen/`).
- The generated README and scripts explain Expo startup, device builds and Maestro; comments explain real constraints such as early RTL initialization and the CLI process-exit workaround (`boilerplate/README.md:10`, `:57`, `boilerplate/package.json:24`, `boilerplate/app/i18n/index.ts:38`, `src/commands/new.ts:1001`).

Weaknesses:
- The source tour has stale configuration guidance and native run instructions; the contributor guide itself flags the tour as outdated (`docs/contributing/Tour-of-Ignite.md:19`, `:87`, `.github/CONTRIBUTING.md:43`).
- Setup combines package-manager installation/linking and a mobile build/toolchain rather than one command (`.github/CONTRIBUTING.md:20`, `boilerplate/README.md:17`). The root build/clean scripts and test harness also assume Unix utilities/shell (`package.json:29`, `:43`, `test/_test-helpers.ts:87`).
- Full integration feedback is costly, and two very large CLI files make small changes harder to locate than the folder layout initially suggests (`test/_test-helpers.ts:15`, `src/commands/new.ts`, `src/tools/generators.ts`).

Worth copying into robkit:
- Document concrete local-binary workflows and maintain the template as a runnable example with a component gallery. Keep architecture-tour claims checked against current scripts and configuration.

## Top 5 practices to copy

1. **Validate the product the scaffolder creates.** Run the shipped CLI, generate additions, then run the output's tests, typecheck and dependency checks (`test/vanilla/ignite-new.test.ts:106`, `:254`, `test/vanilla/ignite-new-expo-router.test.ts:74`). Use non-fixing lint when asserting house-style conformance.
2. **Keep editable generators in each generated project.** EJS plus front matter gives teams local destinations, naming and patches without changing the scaffolder (`boilerplate/ignite/templates/screen/NAMEScreen.tsx.ejs:1`, `docs/concept/Generator-Templates.md:13`, `src/tools/generators.ts:260`).
3. **Enforce preferred app abstractions with useful lint messages.** Restrict raw primitives and point contributors to house components (`boilerplate/.eslintrc.js:33`).
4. **Keep the template runnable and give it a showroom.** Contributors can work on components in context and generated users get concrete examples (`boilerplate/package.json:6`, `boilerplate/app/screens/DemoShowroomScreen/DemoShowroomScreen.tsx`, `docs/contributing/Tour-of-Ignite.md:81`).
5. **Model common external failures as tagged results.** The API problem union gives callers actionable, typed cases that can be extended to CLI/filesystem failures (`boilerplate/app/services/api/apiProblem.ts:3`, `boilerplate/app/services/api/index.ts:57`).
