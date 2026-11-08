"use server";

import { viewer } from "@robkit/next";
import { recordVisit, visitorId } from "../visits.ts";

/** Records another visit by whoever is asking, and counts their visits. */
export async function visitAgain(): Promise<number> {
  return recordVisit(visitorId(await viewer()));
}
