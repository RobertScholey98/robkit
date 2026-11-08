import { orExit, readServeEnv } from "@robkit/input";
import express from "express";
import server from "./server.tsx";

// The app in production, built into dist by vite build: the stylesheet its
// page links, then the guarded app. A container sets HOST to listen beyond
// loopback.
const app = express();
app.use("/assets", express.static("dist/assets"));
app.use(server);

const { host, port } = orExit(readServeEnv(process.env));

app.listen(port, host, (error) => {
  if (error) throw error;
  console.log(`listening on ${host}:${String(port)}`);
});
