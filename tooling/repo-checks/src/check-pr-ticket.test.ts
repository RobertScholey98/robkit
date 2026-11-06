import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ticketProblems } from "./pr-ticket.ts";

const ticket = ".scratch/hillclimb/issues/12-close-the-gaps.md";
const exists = (path: string) => path === ticket;

/** A pull request body as the template lays it out. */
const body = (ticketSection: string) =>
  [
    "## Ticket",
    "",
    "<!-- The ticket this PR works, for example .scratch/hillclimb/issues/12-close-the-gaps.md. -->",
    ticketSection,
    "",
    "## What changed",
    "",
    "Mentions .scratch/elsewhere.md, which isn't the ticket line.",
  ].join("\n");

describe("ticketProblems", () => {
  it("accepts a Ticket section that names an existing file under .scratch/", () => {
    for (const line of [
      ticket,
      `\`${ticket}\``,
      `[ticket 12](${ticket})`,
      `${ticket}, the gates ticket`,
    ]) {
      expect(ticketProblems(body(line), exists)).toEqual([]);
    }
  });

  it("rejects a body with no Ticket section", () => {
    expect(ticketProblems("## What changed\n\nStuff.", exists)).toEqual([
      'The pull request has no "## Ticket" section. Fill in .github/pull_request_template.md and name the ticket\'s file under .scratch/.',
    ]);
    expect(ticketProblems("", exists)).toHaveLength(1);
  });

  it("rejects a Ticket section that names no file, counting the template's comment as nothing", () => {
    expect(ticketProblems(body("Ticket 12."), exists)).toEqual([
      "The pull request's Ticket section names no file under .scratch/. Name the ticket's file, such as .scratch/<feature>/issues/<ticket>.md.",
    ]);
  });

  it("rejects the template as it comes, whatever its comment's example names", async () => {
    const template = await readFile(
      join(import.meta.dirname, "../../../.github/pull_request_template.md"),
      "utf8",
    );

    expect(ticketProblems(template, () => true)).toEqual([
      "The pull request's Ticket section names no file under .scratch/. Name the ticket's file, such as .scratch/<feature>/issues/<ticket>.md.",
    ]);
  });

  it("rejects a file that doesn't exist, or one outside .scratch/", () => {
    expect(
      ticketProblems(body(".scratch/hillclimb/issues/99-gone.md"), exists),
    ).toEqual([
      "The pull request's Ticket section names .scratch/hillclimb/issues/99-gone.md, which doesn't exist on this branch.",
    ]);
    expect(
      ticketProblems(body(".scratch/../package.json"), () => true),
    ).toEqual([
      "The pull request's Ticket section names .scratch/../package.json, which isn't under .scratch/.",
    ]);
  });
});

describe("check-pr-ticket.ts", () => {
  const script = join(import.meta.dirname, "check-pr-ticket.ts");
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "pr-ticket-"));
    await mkdir(join(repo, ".scratch/hillclimb/issues"), { recursive: true });
    await writeFile(join(repo, ticket), "# 12\n");
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  const check = (prBody: string | undefined) => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, PR_BODY: prBody },
    });
    return { status, output: stdout + stderr };
  };

  it("passes a pull request whose ticket exists in the checkout", () => {
    expect(check(body(ticket))).toEqual({
      status: 0,
      output: `Ticket: ${ticket}\n`,
    });
  });

  it("fails one whose ticket doesn't, saying why", () => {
    expect(check(body(".scratch/hillclimb/issues/99-gone.md"))).toEqual({
      status: 1,
      output:
        "The pull request's Ticket section names .scratch/hillclimb/issues/99-gone.md, which doesn't exist on this branch.\n",
    });
  });

  it("fails an empty body", () => {
    expect(check("").status).toBe(1);
  });
});
