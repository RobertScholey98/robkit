import { reportToConsole } from "@robkit/input/report";
import { useEffect, useState } from "react";
import { getSession, signInWithCode, type Session } from "./core-api.ts";
import { coreOrigin, returnTo } from "./core-origin.ts";
import { IntroQuestion, Setup, SignIn } from "./forms.tsx";
import { forwardedBefore, noteForward } from "./forwarded.ts";
import { introCode } from "./intro-link.ts";
import { Launcher } from "./launcher.tsx";
import { Card } from "./ui.tsx";

type Screen =
  | { state: "checking" }
  | { state: "unreachable"; reason: string }
  | { state: "code-refused"; error: string }
  | { state: "intro"; code: string; session: SignedIn }
  | Exclude<Session, SignedIn>
  // With the host of the app that sent a signed-in visitor straight back.
  | (SignedIn & { sentBackFrom?: string });

type SignedIn = Extract<Session, { state: "signed-in" }>;

export function App() {
  let core: string;
  try {
    core = coreOrigin(location.href);
  } catch (error) {
    // Off hub.<domain>, the hub can't tell where core is. The console gets
    // why; the page says what to check.
    reportToConsole("The hub couldn't find core from its address.", error);
    return (
      <Unreachable reason="Can't reach core. Check that `pnpm dev` is running, and open the hub at the address it prints." />
    );
  }
  return <Hub core={core} />;
}

function Hub({ core }: { core: string }) {
  // Read once, since the effect below takes the code out of the address bar.
  const [intro] = useState(() => introCode(location.href));
  const [screen, setScreen] = useState<Screen>({ state: "checking" });

  useEffect(() => {
    let current = true;
    // An intro link is used once; a reload shouldn't use the code again, and
    // it shouldn't stay in the address bar.
    if (intro !== undefined) history.replaceState(null, "", "/");
    void firstScreen(core, intro).then((first) => {
      if (!current) return;
      // A visitor already signed in on the way to an app goes there, by the
      // rule a sign-in follows, unless the hub sent this tab there before:
      // then the app sent them straight back, and forwarding again would
      // loop.
      const next = returnTo(location.href);
      if (first.state !== "signed-in" || next === undefined) {
        setScreen(first);
      } else if (forwardedBefore(next)) {
        setScreen({ ...first, sentBackFrom: new URL(next).host });
      } else {
        forward(next);
      }
    });
    return () => {
      current = false;
    };
  }, [core, intro]);

  // Signing in on the way to an app goes back to it instead of the launcher.
  // The viewer just signed in, so it goes even if the hub sent this tab there
  // before.
  const onSignedIn = (session: Session) => {
    const next = returnTo(location.href);
    if (session.state === "signed-in" && next) forward(next);
    else setScreen(session);
  };

  switch (screen.state) {
    case "checking":
      return (
        <Card>
          <Status dot="bg-muted-foreground/40">Checking core…</Status>
        </Card>
      );
    case "unreachable":
      return <Unreachable reason={screen.reason} />;
    case "unclaimed":
      return <Setup core={core} onSession={onSignedIn} />;
    case "intro":
      return (
        <IntroQuestion
          core={core}
          onSession={onSignedIn}
          code={screen.code}
          profile={screen.session.profile}
          onStay={() => {
            setScreen(screen.session);
          }}
        />
      );
    case "code-refused":
      return <SignIn core={core} onSession={onSignedIn} error={screen.error} />;
    case "signed-out":
      return <SignIn core={core} onSession={onSignedIn} />;
    case "signed-in":
      return (
        <Launcher
          core={core}
          profile={screen.profile}
          sentBackFrom={screen.sentBackFrom}
          onSession={setScreen}
        />
      );
  }
}

function forward(next: string) {
  noteForward(next);
  location.assign(next);
}

/**
 * What the hub shows first: the session core has, or what an intro link
 * makes of it.
 */
async function firstScreen(
  core: string,
  intro: string | undefined,
): Promise<Screen> {
  const result = await getSession(core);
  if (result.outcome === "failed") {
    return { state: "unreachable", reason: result.error };
  }
  const session = result.value;
  if (intro === undefined) return session;
  // Someone is signed in already, so ask before replacing them.
  if (session.state === "signed-in") {
    return { state: "intro", code: intro, session };
  }
  const signedIn = await signInWithCode(core, intro);
  return signedIn.outcome === "ok"
    ? signedIn.value
    : { state: "code-refused", error: signedIn.error };
}

function Unreachable({ reason }: { reason: string }) {
  return (
    <Card>
      <Status dot="bg-destructive">Core is unreachable</Status>
      <p className="mt-2 text-sm text-muted-foreground">{reason}</p>
    </Card>
  );
}

function Status({ dot, children }: { dot: string; children: string }) {
  return (
    <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span className={`size-2 rounded-full ${dot}`} />
      {children}
    </h1>
  );
}
