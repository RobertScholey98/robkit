// The deploy guide, held to robkit deploy itself. The names it reads come
// from what the command and robkit database-urls print when one is
// missing, and the names it sets from what its dry run prints with no
// COOLIFY_URL, so a name added to the code and not the page fails here.

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultChoices, init } from "create-robkit";
import { beforeAll, describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { built, codeBlocks } from "./test/built.ts";

const page = "docs/deploy/coolify/index.html";

const deployMd = () =>
  readFile(
    join(repoRoot, "packages/create-robkit/templates/base/docs/deploy.md"),
    "utf8",
  );

/** This shell's variables, less any robkit deploy or database-urls reads. */
const shell = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !/^(?:COOLIFY_|CF_ACCESS_|ROBKIT_)/.test(name),
  ),
);

/** Runs robkit's command in `cwd` with `env` set, as an owner would. */
const robkit = (args: string[], cwd: string, env: NodeJS.ProcessEnv) =>
  spawnSync(
    process.execPath,
    [join(repoRoot, "packages/create-robkit/src/robkit-command.ts"), ...args],
    { cwd, env: { ...shell, ...env }, encoding: "utf8" },
  );

/** The part of a built page from the `<h2>` with `id` up to the next one. */
function section(html: string, id: string): string {
  const start = html.indexOf(`<h2 id="${id}"`);
  if (start === -1) return "";
  const end = html.indexOf("<h2 ", start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

const text = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll(/&#39;|&#x27;|’/g, "'");

/** Each name in an environment variable's form that `printed` holds. */
const namesIn = (printed: string) =>
  printed.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? [];

/** The page's headings, in order, by id. */
const headings = (html: string) =>
  [...html.matchAll(/<h2 id="([^"]+)"/g)].map(([, id]) => id);

describe("the deploy guide", () => {
  let install: string;

  beforeAll(async () => {
    install = join(await mkdtemp(join(tmpdir(), "site-deploy-")), "install");
    await init(defaultChoices, install, { install: false });
    const [sample] = codeBlocks(await built(page)).filter(
      ({ label }) => label === "coolify.json",
    );
    await writeFile(
      join(install, "coolify.json"),
      String(sample?.code)
        .replace("<the GitHub App's name>", "robkit-github")
        .replace("<owner>/<repo>", "owner/repo")
        .replace("<your domain>", "example.com"),
    );
  }, 60_000);

  it("names each variable robkit deploy reads or sets, and no other", async () => {
    // What it sets: the dry run with no COOLIFY_URL prints each app's.
    const dryRun = robkit(["deploy", "--dry-run"], install, {});
    const sets = [...dryRun.stdout.matchAll(/^ {2}([A-Z_]+)=(.*)$/gm)].flatMap(
      ([, name = "", value = ""]) => [
        name,
        ...(value.startsWith("(shared) ") ? [value.slice(9)] : []),
      ],
    );
    // What it reads: each command names the variable it lacks.
    const reads = [
      robkit(["deploy"], install, {}),
      robkit(["deploy"], install, { COOLIFY_URL: "https://coolify.test" }),
      robkit(["deploy"], install, {
        COOLIFY_URL: "https://coolify.test",
        COOLIFY_TOKEN: "token",
        CF_ACCESS_CLIENT_ID: "id",
      }),
      robkit(["database-urls"], install, {}),
    ].flatMap(({ stdout, stderr }) => namesIn(stdout + stderr));
    const onPage = [
      ...(await built(page)).matchAll(/<code>([^<]+)<\/code>/g),
    ].flatMap(([, code = ""]) => {
      const name = text(code);
      return /^(?:<SLUG>_|[A-Z])[A-Z0-9_]*$/.test(name) ? [name] : [];
    });

    expect(dryRun.status).toBe(0);
    expect(sets).toContain("ROBKIT_TRUSTED_PROXY");
    expect(reads).toEqual(
      expect.arrayContaining(["COOLIFY_TOKEN", "CF_ACCESS_CLIENT_SECRET"]),
    );
    const expected = new Set(
      [...sets, ...reads].map((name) =>
        name.replace(
          /^(?!ROBKIT_)[A-Z0-9]+_DATABASE_URL$/,
          "<SLUG>_DATABASE_URL",
        ),
      ),
    );
    expect(new Set(onPage)).toEqual(expected);
  }, 60_000);

  it("gives each reason the dry run can give, and no other", async () => {
    const source = await readFile(
      join(repoRoot, "packages/create-robkit/src/coolify-deploy.ts"),
      "utf8",
    );
    const reasons = [
      ...source.matchAll(/reason: (?:"([^"]+)"|`([^`]+)`)/g),
    ].map(([, plain, template]) =>
      (plain ?? String(template)).replace("${since}", "1a2b3c4"),
    );
    const listed = [
      ...section(await built(page), "deploy").matchAll(
        /<li><code>([^<]+)<\/code><\/li>/g,
      ),
    ].map(([, reason = ""]) => text(reason));

    expect(reasons).toContain("new on Coolify");
    expect(listed.toSorted()).toEqual([...new Set(reasons)].sort());
  });

  it("takes each setup command and coolify.json from the install's docs/deploy.md", async () => {
    const guide = await deployMd();
    const blocks = codeBlocks(section(await built(page), "set-it-up-once"));

    expect(blocks.map(({ label }) => label)).toEqual([
      "Terminal",
      "Terminal",
      "coolify.json",
    ]);
    for (const { code } of blocks) {
      expect(guide).toContain(code.replaceAll("\n", "\n   "));
    }
  });

  it("says to claim the install straight after the setup, and how to check", async () => {
    const html = await built(page);
    const claim = text(section(html, "claim-it-at-once"));
    const hub = await readFile(
      join(
        repoRoot,
        "packages/create-robkit/templates/base/apps/hub/src/forms.tsx",
      ),
      "utf8",
    );
    const session = await readFile(
      join(repoRoot, "packages/core/src/session-store.ts"),
      "utf8",
    );

    expect(headings(html).slice(1, 3)).toEqual([
      "set-it-up-once",
      "claim-it-at-once",
    ]);
    expect(claim).toContain("as soon as the first deploy finishes");
    for (const heading of ["Set up this install", "Sign in"]) {
      expect(hub).toContain(`<Heading>${heading}</Heading>`);
      expect(claim).toContain(heading);
    }
    expect(claim).toContain("curl https://core.<domain>/session");
    for (const state of ["unclaimed", "signed-out"]) {
      expect(session).toContain(`state: "${state}"`);
      expect(claim).toContain(`{"state":"${state}"}`);
    }
  });

  it("says what it doesn't cover", async () => {
    const items = [
      ...section(await built(page), "what-this-guide-doesnt-cover").matchAll(
        /<li><strong>([^<]+)<\/strong>/g,
      ),
    ].map(([, item]) => item);

    expect(items).toEqual([
      "Other hosts.",
      "Backups.",
      "Observability.",
      "Secret rotation.",
    ]);
  });
});
