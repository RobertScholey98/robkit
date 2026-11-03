import type { Result } from "@internal/core-client";
import { useEffect, useState } from "react";
import { signOut, type Session, type Viewer } from "./core-api.ts";
import { appOrigin } from "./core-origin.ts";
import { listLauncherApps, type LauncherApp } from "./launcher-api.ts";
import { useSend } from "./forms.tsx";
import { Button, FormError } from "./ui.tsx";

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
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-950 antialiased">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-6">
          <p className="text-sm font-semibold tracking-tight">robkit hub</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-neutral-500">
              Signed in as{" "}
              <span className="font-medium text-neutral-900">
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
    return <p className="text-sm text-neutral-500">Loading apps…</p>;
  }
  if (!listing.ok) return <FormError>{listing.error}</FormError>;
  if (listing.value.length === 0) return <NoApps viewer={viewer} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listing.value.map((app) => (
        <li key={app.slug}>
          <a
            href={appOrigin(location.href, app.slug)}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            {app.icon !== null && (
              <span aria-hidden="true" className="text-xl leading-none">
                {app.icon}
              </span>
            )}
            <span className="font-medium" data-testid="app-name">
              {app.name}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function NoApps({ viewer }: { viewer: Viewer }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">No apps yet.</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {viewer.kind === "owner" ? (
          <>
            Apps you add with{" "}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
              robkit add
            </code>{" "}
            show up here.
          </>
        ) : (
          "Apps shared with you show up here."
        )}
      </p>
    </div>
  );
}
