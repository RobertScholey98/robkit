// A server with one slow route, for listen.test.ts: GET /slow answers once
// the test writes a line to its stdin. It listens on the port in PORT and prints what
// listenUntilStopped prints.
import { Hono } from "hono";
import { listenUntilStopped } from "../listen.ts";

let release: () => void = () => undefined;
const released = new Promise<void>((resolve) => {
  release = resolve;
});

process.stdin.once("data", () => {
  release();
});

const app = new Hono();
app.get("/slow", async (c) => {
  console.log("slow request open");
  await released;
  return c.text("finished");
});

process.exit(
  await listenUntilStopped({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: Number(process.env.PORT),
    name: "slow",
  }),
);
