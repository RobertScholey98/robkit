// The theme toggle. Pressed means the dark theme shows, whether the reader
// chose it or the system did. A press stores the choice, which the script
// in the page's head reads before the next page paints.

const key = "robkit-theme";
const root = document.documentElement;
const systemDark = matchMedia("(prefers-color-scheme: dark)");

const isDark = () =>
  root.dataset.theme === undefined
    ? systemDark.matches
    : root.dataset.theme === "dark";

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-theme-toggle]",
)) {
  const show = () => {
    button.setAttribute("aria-pressed", String(isDark()));
  };
  button.hidden = false;
  show();
  button.addEventListener("click", () => {
    const theme = isDark() ? "light" : "dark";
    root.dataset.theme = theme;
    try {
      localStorage.setItem(key, theme);
    } catch {
      // Storage is off: the choice lasts until the page closes.
    }
    show();
  });
  systemDark.addEventListener("change", show);
}
