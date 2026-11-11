import { reportToConsole } from "@robkit/input/report";
import { useEffect, useState } from "react";
import { getSession, signInWithCode, type Session } from "./core-api.ts";
import { coreOrigin, returnTo } from "./core-origin.ts";
import { IntroQuestion, Setup, SignIn } from "./forms.tsx";
import { introCode } from "./intro-link.ts";
import { Launcher } from "./launcher.tsx";
import { Card } from "./ui.tsx";

type Screen =
  | { state: "checking" }
  | { state: "unreachable"; reason: string }
  | { state: "code-refused"; error: string }
  | { state: "intro"; code: string; session: SignedIn }
  | Session;

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
      if (current) setScreen(first);
    });
    return () => {
      current = false;
    };
  }, [core, intro]);

  // Signing in on the way to an app goes back to it instead of the launcher.
  const onSignedIn = (session: Session) => {
    const next = returnTo(location.href);
    if (session.state === "signed-in" && next) location.assign(next);
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
        <Launcher core={core} profile={screen.profile} onSession={setScreen} />
      );
  }
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
