import { Button } from "@internal/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@internal/ui/components/ui/card";
import { Input } from "@internal/ui/components/ui/input";
import { Label } from "@internal/ui/components/ui/label";
import { guarded, type GuardedEnv } from "@robkit/hono";
import { Hono } from "hono";
import { renderToString } from "react-dom/server";
import { addEntry, listEntries, type Entry } from "./entries.ts";
import { entryProblem, limits } from "./entry.ts";
import styles from "./styles.css?url";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const app = new Hono<GuardedEnv>();

// The rule is the one the owner set for this app in admin.
app.use(guarded({ app: env("ROBKIT_APP"), core: env("ROBKIT_CORE_URL") }));

function page(entries: Entry[], canSign: boolean, problem?: string): string {
  return `<!doctype html>${renderToString(
    <Page entries={entries} canSign={canSign} problem={problem} />,
  )}`;
}

app.get("/", async (c) => {
  const canSign = c.var.viewer.kind !== "nobody";
  return c.html(page(await listEntries(), canSign));
});

// Anyone may read the guestbook. Signing it takes signing in.
app.post("/", async (c) => {
  if (c.var.viewer.kind === "nobody") {
    return c.text("Sign in to sign the guestbook.", 403);
  }
  const form = await c.req.parseBody();
  const text = (field: string) => {
    const value = form[field];
    return typeof value === "string" ? value : "";
  };
  const name = text("name");
  const message = text("message");
  const problem = entryProblem(name, message);
  if (problem) return c.html(page(await listEntries(), true, problem), 400);
  await addEntry({ name: name.trim(), message: message.trim() });
  return c.redirect("/", 303);
});

function Page({
  entries,
  canSign,
  problem,
}: {
  entries: Entry[];
  canSign: boolean;
  problem: string | undefined;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Guestbook</title>
        <link rel="stylesheet" href={styles} />
      </head>
      <body>
        <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h1 className="font-heading text-base leading-snug font-medium">
                Guestbook
              </h1>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ul data-testid="entries" className="grid gap-2">
                {entries.map((entry, i) => (
                  <li key={i}>
                    <span className="font-medium">{entry.name}</span>:{" "}
                    <span className="text-muted-foreground">
                      {entry.message}
                    </span>
                  </li>
                ))}
              </ul>
              {canSign ? (
                <form method="post" className="grid gap-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    name="name"
                    maxLength={limits.name}
                    required
                  />
                  <Label htmlFor="message">Message</Label>
                  <Input
                    id="message"
                    name="message"
                    maxLength={limits.message}
                    required
                  />
                  {problem ? (
                    <p role="alert" className="text-destructive">
                      {problem}
                    </p>
                  ) : null}
                  <Button type="submit">Sign the guestbook</Button>
                </form>
              ) : (
                <p className="text-muted-foreground">
                  Sign in to sign the guestbook.
                </p>
              )}
            </CardContent>
          </Card>
        </main>
      </body>
    </html>
  );
}

export default app;
