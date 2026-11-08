import { createServer } from "node:http";
import { orExit, readServeEnv } from "@robkit/input";
import next from "next";

// The app in production, as next build left it in dist. Next serves its
// pages and files, and runs src/proxy.ts, robkit's guard, before them. A
// container sets HOST to listen beyond loopback.
const { host, port } = orExit(readServeEnv(process.env));

const app = next({ dev: false, hostname: host, port });
await app.prepare();
const handle = app.getRequestHandler();

createServer((req, res) => {
  void handle(req, res);
}).listen(port, host, () => {
  console.log(`listening on ${host}:${String(port)}`);
});
