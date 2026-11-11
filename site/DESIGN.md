# robkit.dev style guide

How robkit.dev looks and behaves. Every page and component follows it, and a new page should need nothing it doesn't say. It started from `/ui-ux-pro-max`'s answer for a developer tool's docs and home page: flat, led by its type, with no gradients and no shadows.

The values below are the site's. `src/styles/tokens.css` holds them as custom properties, and a test fails when the two disagree. No other stylesheet or component names a colour: a test fails on a hex, `rgb()` or `hsl()` colour outside `tokens.css`.

## What the site should feel like

robkit is something you run yourself, from a terminal. The site reads like a well-kept manual: plain, exact and quick to scan. Commands and code are the heroes, so the code face does the headings too. One warm accent, amber, marks what you can act on. Nothing moves unless you asked it to.

## Colour

Slate neutrals, one amber accent. Each text colour is at least 4.5 to 1 on every background it sits on, in both themes. The numbers are measured, not rounded up.

| Token                    | Light     | Dark      | Use                                                      |
| ------------------------ | --------- | --------- | -------------------------------------------------------- |
| `--color-bg`             | `#FFFFFF` | `#0B1120` | The page                                                 |
| `--color-surface`        | `#F8FAFC` | `#0F172A` | The sidebar, the header, callouts                        |
| `--color-raised`         | `#F1F5F9` | `#1E293B` | A hovered row, the current page in the sidebar           |
| `--color-code-bg`        | `#F1F5F9` | `#111A2E` | Code blocks and inline code                              |
| `--color-text`           | `#0F172A` | `#F1F5F9` | Body text and headings                                   |
| `--color-muted`          | `#475569` | `#94A3B8` | Secondary text: captions, the page list, the footer      |
| `--color-link`           | `#92400E` | `#FCD34D` | Links in running text                                    |
| `--color-accent`         | `#B45309` | `#FBBF24` | Marks: the current page's bar, the focus ring, a CTA     |
| `--color-on-accent`      | `#FFFFFF` | `#0B1120` | Text on a filled button                                  |
| `--color-button`         | `#92400E` | `#FBBF24` | A filled button's fill                                   |
| `--color-border`         | `#E2E8F0` | `#1E293B` | Dividers that only separate                              |
| `--color-border-control` | `#64748B` | `#64748B` | The edge of a control a reader must find, 3 to 1 or more |

Code is coloured by Shiki as the site builds, from these tokens, so a block needs no script. The rest of a block takes `--color-text`, and comments and punctuation take `--color-muted`. Amber stays out of code, so it still marks only what you can act on.

| Token                   | Light     | Dark      | Use                                        |
| ----------------------- | --------- | --------- | ------------------------------------------ |
| `--color-code-keyword`  | `#9F1239` | `#FDA4AF` | Keywords: `import`, `const`, `func`        |
| `--color-code-string`   | `#166534` | `#86EFAC` | Strings                                    |
| `--color-code-function` | `#1D4ED8` | `#93C5FD` | Function names, and commands in a shell    |
| `--color-code-constant` | `#6D28D9` | `#C4B5FD` | Numbers, `true`, types and other constants |

Measured contrast, light then dark:

| Pair                                 | Light | Dark  |
| ------------------------------------ | ----- | ----- |
| Text on the page                     | 17.85 | 17.19 |
| Muted on the page                    | 7.58  | 7.34  |
| Muted on code and raised             | 6.92  | 5.71  |
| Link on the page                     | 7.09  | 13.06 |
| Link on code and raised              | 6.47  | 10.15 |
| Accent on the page                   | 5.02  | 11.28 |
| Accent on code and raised            | 4.58  | 8.76  |
| On-accent text on a filled button    | 7.09  | 11.28 |
| Control edge on the page and surface | 4.55  | 3.75  |
| Code keyword on code                 | 7.32  | 9.17  |
| Code string on code                  | 6.51  | 12.35 |
| Code function on code                | 6.12  | 9.62  |
| Code constant on code                | 6.49  | 9.39  |

Use the accent for a mark or a focus ring, not for running text. Links use `--color-link`, which is darker in light and lighter in dark, and are underlined so colour isn't the only sign.

## Themes

- Both themes are designed. Neither is an inversion of the other.
- The first paint follows the reader's system setting, in CSS alone, so there is no flash and no script is needed.
- The toggle in the header switches theme and keeps the choice in `localStorage` under `robkit-theme`. A small script in the page's head reads it before the body paints. The site sets no cookie.
- `color-scheme` follows the theme, so scrollbars and form controls match.

## Type

Two faces, both served from the site itself, both under the SIL Open Font Licence:

- **IBM Plex Sans** (variable), for body text and controls.
- **JetBrains Mono** (variable), for headings, the name in the header, code and commands.

| Token             | Value                                                | Use                         |
| ----------------- | ---------------------------------------------------- | --------------------------- |
| `--font-body`     | `"IBM Plex Sans Variable", system-ui, sans-serif`    | Body text and controls      |
| `--font-mono`     | `"JetBrains Mono Variable", ui-monospace, monospace` | Headings, code and commands |
| `--text-xs`       | `0.8125rem`                                          | Small print                 |
| `--text-sm`       | `0.875rem`                                           | The sidebar, captions, code |
| `--text-base`     | `1rem`                                               | Body text                   |
| `--text-lg`       | `1.125rem`                                           | A lead paragraph            |
| `--text-xl`       | `1.25rem`                                            | A third-level heading       |
| `--text-2xl`      | `1.5rem`                                             | A second-level heading      |
| `--text-3xl`      | `2rem`                                               | A page's title              |
| `--leading-body`  | `1.65`                                               | Body text                   |
| `--leading-tight` | `1.25`                                               | Headings                    |

- Body text is 16 pixels at least, and a line of it holds about 70 characters.
- Headings are JetBrains Mono at weight 600, in sentence case, and go in order with no level skipped. A page has one `h1`, its title.
- Text sizes are in `rem`, so the reader's own text size wins.
- Fonts load with `font-display: swap`, so text shows at once in the fallback face.

## Space, size and shape

Space follows a 4-pixel step.

| Token        | Value     |
| ------------ | --------- |
| `--space-1`  | `0.25rem` |
| `--space-2`  | `0.5rem`  |
| `--space-3`  | `0.75rem` |
| `--space-4`  | `1rem`    |
| `--space-6`  | `1.5rem`  |
| `--space-8`  | `2rem`    |
| `--space-12` | `3rem`    |
| `--space-16` | `4rem`    |

| Token           | Value      | Use                                  |
| --------------- | ---------- | ------------------------------------ |
| `--radius-sm`   | `0.25rem`  | Inline code, small marks             |
| `--radius`      | `0.375rem` | Buttons, code blocks, callouts       |
| `--radius-lg`   | `0.625rem` | A panel, the phone menu              |
| `--focus-width` | `2px`      | The focus ring                       |
| `--target`      | `2.75rem`  | The smallest a control may be, 44 px |

No shadows and no gradients. A surface stands apart by its colour and a border.

## Layout

| Token             | Value    | Use                                         |
| ----------------- | -------- | ------------------------------------------- |
| `--header-height` | `3.5rem` | The header                                  |
| `--sidebar-width` | `16rem`  | The list of pages                           |
| `--toc-width`     | `13rem`  | "On this page"                              |
| `--content-width` | `46rem`  | The page's column, about 70 characters wide |

- A docs page has a header, the list of pages on the left, the page in the middle, its headings on the right, and a footer.
- From 64rem (1024 px) wide the list of pages is a column. Below it, the list is behind a "Menu" button in the header, and opens over the page.
- From 80rem (1280 px) the page's headings are a column. Below it, they sit at the top of the page.
- At 375 px nothing scrolls sideways but a code block, which scrolls on its own.
- A skip link is the first thing a keyboard reaches. It goes to the page's main content.

## Controls

- Every control is a real `button` or `a`, reachable by Tab, with a name a screen reader says. An icon-only control has an `aria-label`, and its SVG is `aria-hidden`.
- Every control is `--target` tall and wide at least.
- Focus shows as a `--focus-width` ring in `--color-accent`, 2 px off the control, through `:focus-visible`. Never remove it.
- Hover changes colour only, in `--duration-fast`.
- A toggle says its state: the theme toggle is a `button` with `aria-pressed`, named "Dark theme". The menu button has `aria-expanded` and `aria-controls`.
- The phone menu closes on Escape, on a click outside it and on following a link, and gives focus back to its button.

## Motion

| Token             | Value                        | Use                    |
| ----------------- | ---------------------------- | ---------------------- |
| `--duration-fast` | `120ms`                      | Hover and press        |
| `--duration`      | `180ms`                      | The phone menu opening |
| `--ease`          | `cubic-bezier(0.2, 0, 0, 1)` | Everything that moves  |

- Only `opacity` and `transform` animate.
- With reduced motion set, both durations are 0 and nothing animates or scrolls smoothly.

## Icons

- SVG only, drawn inline, 1.5-pixel strokes on a 24-pixel grid, in `currentColor`. No emoji stands in for an icon.
- The icons come from Lucide (ISC licence), and GitHub's mark from Simple Icons (CC0). `src/components/Icon.astro` holds every one, with its source.

## Scripts and weight

- A docs page reads, and its links work, with no script at all. Without scripts the list of pages shows in the page at phone width, and the theme toggle and the menu button aren't shown, since they can't work.
- The site's own small scripts do the rest: the theme in the head, the toggle, and the phone menu. Later: the copy button, the stack switcher and the search key.
- **Weight limit: the scripts a docs page fetches as it opens, inline and from files, shared ones included, come to at most 10 KB gzipped.** A test measures the built page. The page used 1 KB or so when the limit was set, which leaves room for the copy button, the stack switcher and the search key. What search fetches once a reader opens it is measured on its own.
- Every request stays on the site's own origin: fonts, scripts, styles and images. No analytics and no cookies.
