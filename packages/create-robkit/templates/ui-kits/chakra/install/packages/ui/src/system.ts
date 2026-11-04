import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/** A Chakra token that reads one of the theme's variables at runtime. */
function theme(variable: string) {
  return { value: `var(--${variable})` };
}

/** A tint of a theme colour over the page's background. */
function tint(variable: string, percent: number) {
  return {
    value: `color-mix(in oklch, var(--${variable}) ${String(percent)}%, var(--background))`,
  };
}

/** A radius as a multiple of the theme's `--radius`, as Tailwind's are. */
function radius(times: number) {
  return { value: `calc(var(--radius) * ${String(times)})` };
}

/**
 * Chakra's default theme with its colours, radii and fonts taken from
 * packages/theme/theme.css, which also styles the Tailwind around it. Each
 * token names a CSS variable rather than a value, so changing a variable
 * there restyles Chakra's components and the rest of the page the same way.
 * The variables switch for dark mode themselves, under `.dark`.
 */
const config = defineConfig({
  // Tailwind's own reset already runs on every page that loads the kit.
  preflight: false,
  // Without its reset, Chakra's reset layer is empty, and Emotion writes an
  // empty layer into server-rendered CSS in a way that hides the layer after
  // it from the browser, along with the default colour palette. Chakra's
  // styles come after Tailwind's either way.
  disableLayers: true,
  theme: {
    tokens: {
      // The page's font, which Tailwind sets on <html>.
      fonts: { body: { value: "inherit" }, heading: { value: "inherit" } },
      radii: {
        sm: radius(0.6),
        md: radius(0.8),
        lg: theme("radius"),
        xl: radius(1.4),
        "2xl": radius(1.8),
        "3xl": radius(2.2),
        "4xl": radius(2.6),
      },
    },
    semanticTokens: {
      radii: {
        l1: { value: "{radii.sm}" },
        l2: { value: "{radii.md}" },
        l3: { value: "{radii.lg}" },
      },
      colors: {
        bg: {
          DEFAULT: theme("background"),
          subtle: theme("muted"),
          muted: theme("muted"),
          emphasized: theme("accent"),
          inverted: theme("foreground"),
          panel: theme("card"),
          error: tint("destructive", 10),
        },
        fg: {
          DEFAULT: theme("foreground"),
          muted: theme("muted-foreground"),
          subtle: theme("muted-foreground"),
          inverted: theme("background"),
          error: theme("destructive"),
        },
        border: {
          DEFAULT: theme("border"),
          muted: theme("border"),
          subtle: theme("border"),
          emphasized: theme("input"),
          inverted: theme("foreground"),
          error: theme("destructive"),
        },
        // Every component's default palette, as shadcn's primary and
        // secondary colours.
        gray: {
          contrast: theme("primary-foreground"),
          fg: theme("foreground"),
          subtle: theme("secondary"),
          muted: theme("muted"),
          emphasized: theme("accent"),
          solid: theme("primary"),
          focusRing: theme("ring"),
          border: theme("border"),
        },
        // The palette for anything destructive.
        red: {
          contrast: { value: "white" },
          fg: theme("destructive"),
          subtle: tint("destructive", 10),
          muted: tint("destructive", 20),
          emphasized: tint("destructive", 30),
          solid: theme("destructive"),
          focusRing: theme("destructive"),
          border: theme("destructive"),
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
