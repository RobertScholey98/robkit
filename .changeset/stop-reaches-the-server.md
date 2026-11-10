---
"create-robkit": minor
---

The install's `Dockerfile` runs each app's `start` script with Alpine's shell rather than `node --run`, which passes no signal on. The shell runs the server in its own place, so `docker stop` reaches it and the container exits with the server's own code. The image puts the app's `node_modules/.bin` on `PATH`, as `node --run` did.
