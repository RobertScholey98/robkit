import { reportToConsole } from "@robkit/input/report";

// The `next` addresses the hub has sent this tab to. An app whose guard sends
// a signed-in browser straight back would otherwise loop, so the hub forwards
// to each one once a visit. It keeps them in the hub's own sessionStorage,
// which lasts as long as the tab: the address can't hold them, since the app
// that sends the browser back writes it.
const prefix = "robkit-hub-forwarded ";

/**
 * Whether the hub has sent this tab to `next` before. If the browser won't
 * say, the answer is yes, so the hub can't loop.
 */
export function forwardedBefore(next: string): boolean {
  try {
    return sessionStorage.getItem(prefix + next) !== null;
  } catch (error) {
    reportToConsole("The hub couldn't read this tab's storage.", error);
    return true;
  }
}

/** Notes that the hub is sending this tab to `next`. */
export function noteForward(next: string): void {
  try {
    sessionStorage.setItem(prefix + next, "");
  } catch (error) {
    reportToConsole("The hub couldn't write to this tab's storage.", error);
  }
}
