import type { Result } from "@internal/core-client";
import { useEffect, useState } from "react";
import { getSession, signOut, type Profile, type Session } from "./core-api.ts";
import { appOrigin } from "./core-origin.ts";
import { listLauncherApps, type LauncherApp } from "./launcher-api.ts";
import { useSend } from "./forms.tsx";
import { Button, FormError, InlineCode, Tile } from "./ui.tsx";

/** How often an open launcher asks core for the viewer's apps again. */
const refreshMs = 30_000;

export function Launcher({
  core,
  profile,
  sentBackFrom,
  onSession,
}: {
  core: string;
  profile: Profile;
  /** The host of an app that sent the viewer straight back to the hub. */
  sentBackFrom?: string | undefined;
  onSession: (session: Session) => void;
}) {
  const { sending, send } = useSend(onSession);
  const [listing, setListing] = useState<Result<LauncherApp[]> | undefined>();
  const [attempt, setAttempt] = useState(0);

  // Asks again while the tab is visible, and as it becomes visible, so an app
  // the owner closes to this viewer drops off, and signing out in another tab
  // shows the sign-in page, without a reload.
  useEffect(() => {
    let current = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void refresh(core, profile).then((result) => {
        if (!current) return;
        if (result.outcome === "moved") onSession(result.session);
        else setListing(result);
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
  }, [core, profile, onSession, attempt]);

  return (
    <div className="min-h-screen bg-muted/50 antialiased">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-6">
          <p className="text-sm font-semibold tracking-tight">robkit hub</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {profile.kind === "owner" ? profile.username : profile.name}
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
        <h1 className="sr-only">Your apps</h1>
        {sentBackFrom !== undefined && (
          <p role="status" className="mb-6 text-sm text-muted-foreground">
            {`${sentBackFrom} sent you straight back here. Try opening it again below.`}
          </p>
        )}
        {sending.state === "failed" && (
          <div className="mb-6">
            <FormError>{sending.error}</FormError>
          </div>
        )}
        <AppList
          profile={profile}
          listing={listing}
          onRetry={() => {
            setAttempt((n) => n + 1);
          }}
        />
      </main>
    </div>
  );
}

/**
 * The viewer's apps, or the session core has now if it isn't this viewer's
 * any more. A core that can't be reached is a failure, not a sign-out.
 */
async function refresh(
  core: string,
  profile: Profile,
): Promise<{ outcome: "moved"; session: Session } | Result<LauncherApp[]>> {
  const session = await getSession(core);
  if (session.outcome === "failed") return session;
  const now = session.value;
  if (
    now.state !== "signed-in" ||
    now.profile.kind !== profile.kind ||
    now.profile.id !== profile.id
  ) {
    return { outcome: "moved", session: now };
  }
  return listLauncherApps(core);
}

function AppList({
  profile,
  listing,
  onRetry,
}: {
  profile: Profile;
  listing: Result<LauncherApp[]> | undefined;
  onRetry: () => void;
}) {
  if (listing === undefined) {
    return <p className="text-sm text-muted-foreground">Loading apps…</p>;
  }
  if (listing.outcome === "failed") {
    return (
      <div className="grid justify-items-start gap-3">
        <FormError>{listing.error}</FormError>
        <Button look="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (listing.value.length === 0) return <NoApps profile={profile} />;
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

function NoApps({ profile }: { profile: Profile }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <h2 className="text-lg font-semibold tracking-tight">No apps yet.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {profile.kind === "owner" ? (
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
