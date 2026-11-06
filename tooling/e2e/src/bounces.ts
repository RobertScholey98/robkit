import { expect } from "vitest";
import type { DevStack } from "./dev-stack.ts";

// Matchers for the pages a browser passes through as an app's guard sends
// it to core and back.

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches the trip to core's /refresh an app's guard starts, back to `next`. */
export function refreshing(dev: DevStack, next: string): string {
  const refresh = dev.at("core", `/refresh?next=${encodeURIComponent(next)}`);
  return expect.stringMatching(
    new RegExp(`^${escaped(refresh)}&state=[\\w-]{43}$`),
  ) as string;
}

/**
 * Matches core sending the browser back to `next`'s app, with a token for
 * that app or none.
 */
export function handedBack(
  next: string,
  { token }: { token: boolean },
): string {
  const callback = `${new URL(next).origin}/_robkit/session?next=${encodeURIComponent(next)}`;
  const tail = token ? "&token=[\\w-]+\\.[\\w-]+\\.[\\w-]+" : "";
  return expect.stringMatching(
    new RegExp(`^${escaped(callback)}&state=[\\w-]{43}${tail}$`),
  ) as string;
}
