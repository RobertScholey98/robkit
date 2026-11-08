---
"@robkit/core": patch
"@robkit/session": patch
"@robkit/dev": patch
"create-robkit": patch
---

Failures where robkit starts processes, stops them and answers requests say what to do. The dev runner stops cleanly when an app can't start, runs every stop step even when one fails, and treats only `ESRCH` as a stopped process group. A failed command names itself, its folder and its exit code. A broken template override is a problem the person can fix, not a robkit bug. Core's 500 carries a request id that its log line shares. One `Report` type, with `reportToConsole` as its default, serves core's `logError`, the guard's default `onUnavailable` and the command lines.
