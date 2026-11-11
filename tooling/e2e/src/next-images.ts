import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { freePort } from "@internal/test-postgres";
import { fakeCore, sessionCookieOn } from "@internal/test-session";
import { onTestFinished } from "vitest";

const run = promisify(execFile);

/** A PNG of one pixel, which Next's optimizer can read. */
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** A page that draws an image it imports, which Next builds in. */
const imagesPage = `import Image from "next/image";
import logo from "./logo.png";

export default function Images() {
  return <Image src={logo} alt="The logo" />;
}
`;

/** What the built app answered: its status and content type. */
export interface Answered {
  status: number;
  type: string | null;
}

/** What a built Next app behind the guard answered the owner, and nobody. */
export interface ImageAnswers {
  /** A `public` file, as `<img>` or `<Image unoptimized>` asks for it. */
  publicFile: Answered;
  /** The same file, asked for with no session. */
  publicFileSignedOut: Answered;
  /** The same file through Next's optimizer, as `<Image src>` asks for it. */
  optimizedPublicFile: Answered;
  /** An image the page imports, through Next's optimizer. */
  optimizedImport: Answered;
}

/**
 * Builds the Next app at `app` with a `public` image and a page that
 * imports one, serves it behind the guard with a fake core whose rule
 * lets only the owner in, and asks it for each kind of image as the
 * owner, and once with no session.
 */
export async function nextImageAnswers(app: string): Promise<ImageAnswers> {
  const added = [join(app, "public"), join(app, "src/app/images")];
  onTestFinished(async () => {
    await Promise.all(added.map((dir) => rm(dir, { recursive: true })));
  });
  await mkdir(join(app, "public"));
  await mkdir(join(app, "src/app/images"));
  await writeFile(join(app, "public/logo.png"), png);
  await writeFile(join(app, "src/app/images/logo.png"), png);
  await writeFile(join(app, "src/app/images/page.tsx"), imagesPage);
  await run("pnpm", ["run", "build"], {
    cwd: app,
    maxBuffer: 16 * 1024 * 1024,
  });

  const core = await fakeCore();
  core.rules.example = { kind: "owner" };
  const port = await freePort();
  const server = spawn(process.execPath, ["src/serve.ts"], {
    cwd: app,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      ROBKIT_APP: "example",
      ROBKIT_CORE_URL: core.origin,
    },
    stdio: "ignore",
  });
  onTestFinished(async () => {
    if (server.exitCode === null) {
      server.kill();
      await once(server, "exit");
    }
  });
  const cookie = `${sessionCookieOn(core.origin)}=${await core.key.token()}`;
  const ask = (path: string, signedIn = true) =>
    fetch(`http://127.0.0.1:${String(port)}${path}`, {
      headers: signedIn ? { cookie } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  const answered = async (path: string, signedIn = true) => {
    const res = await ask(path, signedIn);
    await res.arrayBuffer();
    return { status: res.status, type: res.headers.get("content-type") };
  };

  // The server is up once it answers.
  const page = await until(() => ask("/images"));
  const html = await page.text();
  const imported =
    /\/_next\/image\?url=(%2F_next%2Fstatic%2Fmedia%2F[^&"]+)/.exec(html)?.[1];
  if (imported === undefined) {
    throw new Error(
      `The built /images page answered ${String(page.status)} with no imported image: ${html}`,
    );
  }
  const optimized = (url: string) => `/_next/image?url=${url}&w=64&q=75`;
  return {
    publicFile: await answered("/logo.png"),
    publicFileSignedOut: await answered("/logo.png", false),
    optimizedPublicFile: await answered(optimized("%2Flogo.png")),
    optimizedImport: await answered(optimized(imported)),
  };
}

/** What `attempt` answers once it stops throwing, within a minute. */
async function until<T>(attempt: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
