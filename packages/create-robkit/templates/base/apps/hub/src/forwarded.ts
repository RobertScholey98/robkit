import { reportToConsole } from "@robkit/input/report";

// The `next` addresses the hub has sent this tab to. An app whose guard sends
// a signed-in browser straight back would otherwise loop, so the hub forwards
// to each one once a visit. It keeps them in the hub's own sessionStorage,
// which lasts as long as the tab: the address can't hold them, since the app
// that sends the browser back writes it.
const prefix = "robkit-hub-forwarded ";

/**
 * Whether the hub has sent this tab to `next` before, or undefined when the
 * browser won't say. The hub forwards only on a no, so it can't loop.
 */
export function forwardedBefore(next: string): boolean | undefined {
  try {
    return sessionStorage.getItem(prefix + next) !== null;
  } catch (error) {
    reportToConsole("The hub couldn't read this tab's storage.", error);
    return undefined;
  }
}

/**
 * Notes that the hub is sending this tab to `next`, and answers whether the
 * browser kept the note. A full storage reads and refuses each write, and
 * without the note the next visit would forward again.
 */
export function noteForward(next: string): boolean {
  try {
    sessionStorage.setItem(prefix + next, "");
    return true;
  } catch (error) {
    reportToConsole("The hub couldn't write to this tab's storage.", error);
    return false;
  }
}
