import { Button } from "@internal/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@internal/ui/components/ui/card";
import { Input } from "@internal/ui/components/ui/input";
import { Label } from "@internal/ui/components/ui/label";
import { guarded, type GuardedEnv } from "@robkit/hono";
import { Hono } from "hono";
import { renderToString } from "react-dom/server";
import { listEntries, sign, type Entry } from "./entries.ts";
import styles from "./styles.css?url";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const app = new Hono<GuardedEnv>();

// The rule is the one the owner set for this app in admin.
app.use(guarded({ app: env("ROBKIT_APP"), core: env("ROBKIT_CORE_URL") }));

app.get("/", async (c) =>
  c.html(
    `<!doctype html>${renderToString(<Page entries={await listEntries()} />)}`,
  ),
);

app.post("/", async (c) => {
  const form = await c.req.parseBody();
  const field = (key: string) => {
    const value = form[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const name = field("name");
  const message = field("message");
  if (name !== "" && message !== "") await sign({ name, message });
  return c.redirect("/", 303);
});

function Page({ entries }: { entries: Entry[] }) {
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
              <form method="post" className="grid gap-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" name="name" required />
                <Label htmlFor="message">Message</Label>
                <Input id="message" name="message" required />
                <Button type="submit">Sign the guestbook</Button>
              </form>
              <ul className="grid gap-2" aria-label="Messages">
                {entries.map((signed, index) => (
                  <li key={index} data-testid="entry">
                    <span className="font-medium">{signed.name}</span>:{" "}
                    <span className="text-muted-foreground">
                      {signed.message}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </main>
      </body>
    </html>
  );
}

export default app;
