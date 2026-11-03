import type { Result } from "@internal/core-client";
import { useEffect, useState } from "react";
import { signOut, type Session, type Viewer } from "./core-api.ts";
import { appOrigin } from "./core-origin.ts";
import { listLauncherApps, type LauncherApp } from "./launcher-api.ts";
import { useSend } from "./forms.tsx";
import { Button, FormError, InlineCode, Tile } from "./ui.tsx";

/** How often an open launcher asks core for the viewer's apps again. */
const refreshMs = 30_000;

export function Launcher({
  core,
  viewer,
  onSession,
}: {
  core: string;
  viewer: Viewer;
  onSession: (session: Session) => void;
}) {
  const { sending, send } = useSend(onSession);
  const [listing, setListing] = useState<Result<LauncherApp[]> | undefined>();

  // Asks again while the tab stays open, so an app the owner closes to this
  // viewer drops off without a reload.
  useEffect(() => {
    let current = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void listLauncherApps(core).then((result) => {
        if (current) setListing(result);
      });
    };
    load();
    const timer = setInterval(load, refreshMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [core]);

  return (
    <div className="min-h-screen bg-muted/50 antialiased">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-6">
          <p className="text-sm font-semibold tracking-tight">robkit hub</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {viewer.kind === "owner" ? viewer.username : viewer.name}
              </span>
            </p>
            <Button
              look="outline"
              type="button"
              disabled={sending.state === "sending"}
              onClick={() => void send(() => signOut(core))}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        {sending.state === "failed" && (
          <div className="mb-6">
            <FormError>{sending.error}</FormError>
          </div>
        )}
        <AppList viewer={viewer} listing={listing} />
      </main>
    </div>
  );
}

function AppList({
  viewer,
  listing,
}: {
  viewer: Viewer;
  listing: Result<LauncherApp[]> | undefined;
}) {
  if (listing === undefined) {
    return <p className="text-sm text-muted-foreground">Loading apps…</p>;
  }
  if (!listing.ok) return <FormError>{listing.error}</FormError>;
  if (listing.value.length === 0) return <NoApps viewer={viewer} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listing.value.map((app) => (
        <li key={app.slug}>
          <Tile href={appOrigin(location.href, app.slug)}>
            {app.icon !== null && (
              <span aria-hidden="true" className="text-xl leading-none">
                {app.icon}
              </span>
            )}
            <span className="font-medium" data-testid="app-name">
              {app.name}
            </span>
          </Tile>
        </li>
      ))}
    </ul>
  );
}

function NoApps({ viewer }: { viewer: Viewer }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">No apps yet.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {viewer.kind === "owner" ? (
          <>
            Apps you add with <InlineCode>robkit add</InlineCode> show up here.
          </>
        ) : (
          "Apps shared with you show up here."
        )}
      </p>
    </div>
  );
}
