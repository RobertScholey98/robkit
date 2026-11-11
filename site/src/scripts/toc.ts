// "On this page": marks the link to the heading the reader is in, as the
// page scrolls. That is the last heading whose top has passed the header.
// Without scripts the list is plain links.
//
// From 80rem the list is a column, and its fold opens. CSS alone shows the
// column's links without scripts, but a closed fold still tells assistive
// tech they are hidden.

const toc = document.querySelector("[data-toc]");

if (toc !== null) {
  const fold = toc.querySelector("details");
  const wide = matchMedia("(min-width: 80rem)");
  const fit = () => {
    if (fold !== null) fold.open = wide.matches;
  };
  wide.addEventListener("change", fit);
  fit();

  const links = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const targets = links.flatMap((link) => {
    const heading = document.getElementById(
      decodeURIComponent(link.hash.slice(1)),
    );
    return heading === null ? [] : [{ link, heading }];
  });
  const offset = () =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).scrollPaddingTop,
    ) || 0;

  let marked: HTMLAnchorElement | undefined;
  const mark = () => {
    const line = offset() + 1;
    let current = targets[0]?.link;
    for (const { link, heading } of targets) {
      if (heading.getBoundingClientRect().top <= line) current = link;
    }
    // At the foot of the page, the last heading is the one in view.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1) {
      current = targets.at(-1)?.link;
    }
    if (current === marked) return;
    marked?.removeAttribute("aria-current");
    current?.setAttribute("aria-current", "true");
    marked = current;
  };

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mark();
    });
  };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  mark();
}
