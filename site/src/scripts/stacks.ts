// The stack switchers on a page. Choosing a stack in one chooses it in
// every switcher, and stores it for the next page, whose head script
// applies it before the page paints. The tabs follow the ARIA tabs
// pattern: arrow keys, Home and End move between them.

const stackKey = "robkit-stack";
const html = document.documentElement;
const switches = [
  ...document.querySelectorAll<HTMLElement>("[data-stack-switch]"),
];
const tabsOf = (element: HTMLElement) => [
  ...element.querySelectorAll<HTMLButtonElement>("[data-stack-tab]"),
];

function show(stack: string) {
  html.dataset.stack = stack;
  for (const element of switches) {
    for (const tab of tabsOf(element)) {
      const chosen = tab.dataset.stackTab === stack;
      tab.setAttribute("aria-selected", String(chosen));
      tab.tabIndex = chosen ? 0 : -1;
    }
  }
}

function choose(stack: string) {
  show(stack);
  try {
    localStorage.setItem(stackKey, stack);
  } catch {
    // Storage is off: the choice lasts until the page closes.
  }
}

let count = 0;
for (const element of switches) {
  const tabs = tabsOf(element);
  for (const tab of tabs) {
    const stack = tab.dataset.stackTab ?? "";
    const panel = element.querySelector<HTMLElement>(
      `[data-stack-panel="${stack}"]`,
    );
    count += 1;
    tab.id = `stack-tab-${String(count)}`;
    if (panel) {
      panel.id = `stack-panel-${String(count)}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.tabIndex = 0;
      tab.setAttribute("aria-controls", panel.id);
    }
    tab.addEventListener("click", () => {
      choose(stack);
    });
    tab.addEventListener("keydown", (event) => {
      const at = tabs.indexOf(tab);
      const next = {
        ArrowRight: tabs[(at + 1) % tabs.length],
        ArrowLeft: tabs[(at - 1 + tabs.length) % tabs.length],
        Home: tabs[0],
        End: tabs[tabs.length - 1],
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      choose(next.dataset.stackTab ?? "");
      next.focus();
    });
  }
}

// A stored stack the switchers don't offer, such as one robkit dropped,
// gives way to the first.
const offered = switches.flatMap((element) =>
  tabsOf(element).map((tab) => tab.dataset.stackTab),
);
const stored = html.dataset.stack;
const first = offered[0];
if (stored !== undefined && offered.includes(stored)) show(stored);
else if (first !== undefined) show(first);
