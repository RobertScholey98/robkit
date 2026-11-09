// Run by removeWhenGone: waits for the owner process to exit, then removes
// what it left. Arguments: the owner's pid and the leftovers as JSON.
import { setTimeout as sleep } from "node:timers/promises";
import { readLeftovers } from "./clean-up.ts";
import { alive, removeAll } from "./remove.ts";

const [ownerArg = "", leftoversArg = "[]"] = process.argv.slice(2);
const owner = Number(ownerArg);
const leftovers = readLeftovers(leftoversArg);

while (alive(owner)) await sleep(1000);

await removeAll(leftovers);
