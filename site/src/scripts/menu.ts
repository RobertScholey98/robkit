// The phone menu: the button in the header opens the list of pages over
// the page. It closes on Escape, on a click outside it, on following a
// link and when focus leaves it, and Escape gives focus back to the
// button. From 64rem wide the list is a column and the button is hidden.

const button = document.querySelector<HTMLButtonElement>("[data-menu-button]");
const nav = document.getElementById("site-nav");

if (button !== null && nav !== null) {
  const isOpen = () => button.getAttribute("aria-expanded") === "true";

  const setOpen = (open: boolean, focusButton = false) => {
    button.setAttribute("aria-expanded", String(open));
    nav.toggleAttribute("data-open", open);
    if (open) {
      const link =
        nav.querySelector<HTMLAnchorElement>('[aria-current="page"]') ??
        nav.querySelector<HTMLAnchorElement>("a");
      link?.focus();
    } else if (focusButton) {
      button.focus();
    }
  };

  button.hidden = false;
  button.addEventListener("click", () => {
    setOpen(!isOpen());
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) setOpen(false, true);
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      isOpen() &&
      target instanceof Node &&
      !nav.contains(target) &&
      !button.contains(target)
    ) {
      setOpen(false);
    }
  });
  nav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setOpen(false);
    }
  });
  nav.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (
      isOpen() &&
      next instanceof Node &&
      !nav.contains(next) &&
      !button.contains(next)
    ) {
      setOpen(false);
    }
  });
  matchMedia("(min-width: 64rem)").addEventListener("change", () => {
    setOpen(false);
  });
}
