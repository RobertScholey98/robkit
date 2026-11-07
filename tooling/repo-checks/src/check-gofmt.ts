// Fails when a Go file in the current folder, or under it, isn't as gofmt
// writes it, and names each one. gofmt -l lists them but exits 0, so the Go
// module's lint script runs this from go/:
//   node ../tooling/repo-checks/src/check-gofmt.ts
import { execFileSync } from "node:child_process";

const unformatted = execFileSync("gofmt", ["-l", "."], {
  encoding: "utf8",
}).trim();

if (unformatted !== "") {
  console.error(
    `gofmt would change these files:\n${unformatted}\nRun gofmt -w . in ${process.cwd()} to fix them.`,
  );
  process.exit(1);
}
