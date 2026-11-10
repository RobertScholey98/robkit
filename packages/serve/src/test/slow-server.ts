// A server with one slow route, for listen.test.ts: GET /slow answers once
// the test writes a line to its stdin. It listens on the port in PORT and
// prints what listenUntilStopped prints.
import { listenUntilStopped } from "../listen.ts";

const { promise: released, resolve: release } = Promise.withResolvers();

process.stdin.once("data", () => {
  release(undefined);
});

process.exit(
  await listenUntilStopped(
    (request, response) => {
      if (request.url !== "/slow") {
        response.end("quick");
        return;
      }
      console.log("slow request open");
      void released.then(() => {
        response.end("finished");
      });
    },
    {
      hostname: "127.0.0.1",
      port: Number(process.env.PORT),
      name: "slow",
      onStopped: () => Promise.resolve(),
    },
  ),
);
