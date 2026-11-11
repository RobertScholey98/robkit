// The search dialog, loaded the first time search opens. It fetches the
// index once, finds as the reader types, and lists each result as a link.
// When the index fails or is too slow to come, the status line says so,
// and the next key the reader types tries again.
// The arrow keys move between the box and the results, Enter opens the
// first result from the box, and Escape closes the dialog and gives focus
// back to where it was.

import { orThrow } from "@robkit/input";
import {
  find,
  type Found,
  readSearchIndex,
  type SearchIndex,
} from "../search.ts";

const dialog = document.querySelector<HTMLDialogElement>("dialog#search");
const input = document.querySelector<HTMLInputElement>("#search-input");
const status = document.querySelector<HTMLElement>("#search-status");
const results = document.querySelector<HTMLUListElement>("#search-results");

const hints = {
  empty: "Type a command, a setting or any word from the docs.",
  loading: "Loading search…",
  failed:
    "Search couldn't load. Check your connection, then type to try again.",
  slow: "Search is taking too long to load. Check your connection, then type to try again.",
};

/** How long the index may take to arrive before search gives up on it. */
const deadline = 10_000;

let index: SearchIndex | undefined;
let loading: Promise<void> | undefined;
/** Why the last load failed, until one works. */
let failure: "failed" | "slow" = "failed";
let returnTo: HTMLElement | undefined;

/** A result's link: its page and heading, then its text with each word marked. */
function resultLink({ title, heading, href, excerpt }: Found): HTMLLIElement {
  const link = document.createElement("a");
  link.href = href;
  const place = document.createElement("span");
  place.className = "place";
  place.textContent = title;
  if (heading !== undefined) {
    const under = document.createElement("span");
    under.className = "heading";
    under.textContent = ` › ${heading}`;
    place.append(under);
  }
  const text = document.createElement("span");
  text.className = "excerpt";
  let from = 0;
  for (const [start, end] of excerpt.marks) {
    if (start < from) continue;
    const mark = document.createElement("mark");
    mark.textContent = excerpt.text.slice(start, end);
    text.append(excerpt.text.slice(from, start), mark);
    from = end;
  }
  text.append(excerpt.text.slice(from));
  link.append(place, text);
  const item = document.createElement("li");
  item.append(link);
  return item;
}

function show(): void {
  if (input === null || status === null || results === null) return;
  results.replaceChildren();
  const query = input.value.trim();
  if (index === undefined) {
    status.textContent = loading === undefined ? hints[failure] : hints.loading;
    return;
  }
  if (query === "") {
    status.textContent = hints.empty;
    return;
  }
  const found = find(index, query);
  if (found.length === 0) {
    status.textContent = `Nothing in the docs matches “${query}”. Try a command, such as robkit add, or a setting, such as ROBKIT_DOMAIN.`;
    return;
  }
  status.textContent =
    found.length === 1 ? "1 result" : `${String(found.length)} results`;
  results.append(...found.map(resultLink));
}

async function loadIndex(): Promise<void> {
  const response = await fetch("/search.json", {
    signal: AbortSignal.timeout(deadline),
  });
  if (!response.ok) throw new Error(`search.json: ${String(response.status)}`);
  const parsed: unknown = await response.json();
  index = orThrow(readSearchIndex(parsed));
}

/** Loads the index unless it is loaded or loading. A failed load can try again. */
function load(): void {
  if (index !== undefined) return;
  loading ??= loadIndex().then(show, (error: unknown) => {
    failure =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "slow"
        : "failed";
    loading = undefined;
    show();
  });
}

/** Opens search, and gives focus back to `from` when it closes. */
export function open(from: Element | null): void {
  if (dialog === null || input === null) return;
  returnTo = from instanceof HTMLElement ? from : undefined;
  if (!dialog.open) dialog.showModal();
  input.focus();
  input.select();
  load();
  show();
}

if (dialog !== null && input !== null && results !== null) {
  const close = (giveFocusBack: boolean) => {
    if (!giveFocusBack) returnTo = undefined;
    dialog.close();
  };

  dialog.addEventListener("close", () => {
    returnTo?.focus();
    returnTo = undefined;
  });
  input.addEventListener("input", () => {
    load();
    show();
  });
  dialog.querySelector("[data-search-close]")?.addEventListener("click", () => {
    close(true);
  });
  // A click on the backdrop lands on the dialog itself.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close(true);
  });
  // Following a result leaves the page, or moves within it.
  results.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      close(false);
    }
  });
  dialog.addEventListener("keydown", (event) => {
    const links = [...results.querySelectorAll("a")];
    const at = links.findIndex((link) => link === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      links[Math.min(at + 1, links.length - 1)]?.focus();
    } else if (event.key === "ArrowUp" && at >= 0) {
      event.preventDefault();
      (at === 0 ? input : links[at - 1])?.focus();
    } else if (event.key === "Enter" && event.target === input) {
      event.preventDefault();
      links[0]?.click();
    }
  });
}
