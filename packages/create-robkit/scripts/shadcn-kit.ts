// Regenerates the install's packages/ui from the shadcn CLI on Base UI, so
// the kit is shadcn's own output at the version in robkit's catalog. init
// copies it, which keeps it offline and the same every time.
//
//   pnpm --filter create-robkit shadcn-kit
//
// It also rewrites the install's theme tokens from the CLI's, which the hub,
// admin and every app read.
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { jsonObject, stringsIn } from "../src/json.ts";
import { readRobkitRepo } from "../src/robkit-repo.ts";

/** The components the hub's and admin's ui.tsx draw with. */
const components = [
  "badge",
  "button",
  "card",
  "checkbox",
  "input",
  "label",
  "radio-group",
  "table",
];

/** The CSS shadcn adds that is the kit's own rather than a theme token. */
const kitImports = ["tailwindcss", "tw-animate-css", "shadcn/tailwind.css"];

if (process.argv.length > 2) throw new Error("Usage: shadcn-kit");

const templates = fileURLToPath(new URL("../templates/", import.meta.url));
const ui = join(templates, "base", "packages", "ui");
const { catalog } = await readRobkitRepo();

function version(name: string): string {
  const pinned = catalog.get(name);
  if (pinned === undefined)
    throw new Error(`${name} isn't in robkit's catalog`);
  return pinned;
}

function shadcn(cwd: string, args: string[]): void {
  const command = ["npx", "--yes", `shadcn@${version("shadcn")}`, ...args];
  // npx is a .cmd on Windows, which only a shell runs. The arguments are
  // this script's own words, so joining them is safe.
  const result =
    process.platform === "win32"
      ? spawnSync(command.join(" "), { cwd, stdio: "inherit", shell: true })
      : spawnSync("npx", command.slice(1), { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`shadcn ${args.join(" ")} failed`);
}

async function formatted(text: string, filepath: string): Promise<string> {
  return format(text, { filepath });
}

/** A project shadcn's CLI recognises: Vite, Tailwind 4 and an @/ alias. */
async function scratchProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-shadcn-"));
  const devDependencies = Object.fromEntries(
    ["@tailwindcss/vite", "@types/react", "react", "react-dom", "tailwindcss"]
      .concat(["typescript", "vite"])
      .map((name) => [name, version(name)]),
  );
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@internal/ui",
      private: true,
      type: "module",
      devDependencies,
    }),
  );
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { jsx: "react-jsx", paths: { "@/*": ["./src/*"] } },
    }),
  );
  await writeFile(
    join(dir, "vite.config.ts"),
    'import tailwindcss from "@tailwindcss/vite";\nexport default { plugins: [tailwindcss()] };\n',
  );
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "styles.css"), '@import "tailwindcss";\n');
  return dir;
}

/** shadcn's @/ imports, as the install's packages/ui names itself. */
function selfImports(text: string, file: string): string {
  const rewritten = text.replaceAll('"@/', '"@internal/ui/');
  if (rewritten.includes("@/")) throw new Error(`${file} imports through @/`);
  return rewritten;
}

const dir = await scratchProject();
try {
  shadcn(dir, [
    "init",
    "--base",
    "base",
    "--preset",
    "nova",
    "--no-monorepo",
    "--no-rtl",
  ]);
  shadcn(dir, ["add", "--yes", ...components]);

  // The components, as the install's packages/ui holds them.
  const generated = join(dir, "src", "components", "ui");
  const target = join(ui, "src", "components", "ui");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of await readdir(generated)) {
    const text = await readFile(join(generated, file), "utf8");
    await writeFile(
      join(target, file),
      await formatted(selfImports(text, file), file),
    );
  }
  await mkdir(join(ui, "src", "lib"), { recursive: true });
  await writeFile(
    join(ui, "src", "lib", "utils.ts"),
    await formatted(
      await readFile(join(dir, "src", "lib", "utils.ts"), "utf8"),
      "utils.ts",
    ),
  );

  // Where shadcn's CLI writes the components an owner adds later.
  const config = jsonObject(
    await readFile(join(dir, "components.json"), "utf8"),
    "components.json",
  );
  config.aliases = Object.fromEntries(
    Object.entries(stringsIn(config.aliases)).map(([key, alias]) => [
      key,
      alias.replace(/^@\//, "@internal/ui/"),
    ]),
  );
  await writeFile(
    join(ui, "components.json"),
    await formatted(JSON.stringify(config), "components.json"),
  );

  // The theme tokens: the rest of shadcn's stylesheet, without the kit's own.
  const styles = await readFile(join(dir, "src", "styles.css"), "utf8");
  const tokens = styles
    .split("\n")
    .filter((line) => !kitImports.some((name) => line === `@import "${name}";`))
    .join("\n");
  const theme = join(templates, "base", "packages", "theme", "theme.css");
  const header = (await readFile(theme, "utf8")).split("*/")[0] ?? "";
  await writeFile(
    theme,
    await formatted(`${header}*/\n${tokens}`, "theme.css"),
  );

  // Every dependency shadcn added must be in the kit's manifest and the catalog.
  const added = Object.keys(
    stringsIn(
      jsonObject(
        await readFile(join(dir, "package.json"), "utf8"),
        "shadcn's package.json",
      ).dependencies,
    ),
  );
  const kitDependencies = stringsIn(
    jsonObject(
      await readFile(join(ui, "package.json"), "utf8"),
      "packages/ui/package.json",
    ).dependencies,
  );
  const missing = added.filter(
    (name) => !(name in kitDependencies) || !catalog.has(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Add these to packages/ui/package.json and robkit's catalog: ${missing.join(", ")}`,
    );
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
