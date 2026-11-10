"use server";

import { viewer } from "@robkit/next";
import { visitAgainAs, visits } from "../visits.ts";

/** Records another visit by whoever is asking, and counts their visits. */
export async function visitAgain(): Promise<number> {
  return visitAgainAs(await viewer(), visits);
}
