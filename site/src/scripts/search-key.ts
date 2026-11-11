// What loads with every page for search: each search button, and the /
// key, which opens search unless the reader is typing in a field. The
// dialog's script, and the index it fetches, load the first time search
// opens. Without scripts the buttons stay hidden, since they can't work.

import type * as SearchDialog from "./search-dialog.ts";

let dialog: Promise<typeof SearchDialog> | undefined;

function openSearch(from: Element | null): void {
  dialog ??= import("./search-dialog.ts");
  void dialog.then(({ open }) => {
    open(from);
  });
}

const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-search-button]",
)) {
  button.hidden = false;
  button.addEventListener("click", () => {
    openSearch(button);
  });
}

document.addEventListener("keydown", (event) => {
  if (
    event.key !== "/" ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.defaultPrevented ||
    typing(event.target)
  ) {
    return;
  }
  event.preventDefault();
  openSearch(document.activeElement);
});
