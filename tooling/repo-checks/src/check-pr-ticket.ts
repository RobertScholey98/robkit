// Checks that a pull request's Ticket section names a ticket that exists.
// CI's pull-request job passes the body in PR_BODY and runs it from the
// checkout of the pull request's head:
//   PR_BODY="$BODY" node tooling/repo-checks/src/check-pr-ticket.ts
import { statSync } from "node:fs";
import { ticketPaths, ticketProblems } from "./pr-ticket.ts";

const body = process.env.PR_BODY ?? "";
const problems = ticketProblems(
  body,
  (path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true,
);
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log(`Ticket: ${ticketPaths(body).join(", ")}`);
