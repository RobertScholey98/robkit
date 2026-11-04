import { useEffect, useState } from "react";
import { getSession, signInWithCode, type Session } from "./core-api.ts";
import { coreOrigin, returnTo } from "./core-origin.ts";
import { Setup, SignIn } from "./forms.tsx";
import { introCode } from "./intro-link.ts";
import { Launcher } from "./launcher.tsx";
import { Card } from "./ui.tsx";

type Screen =
  | { state: "checking" }
  | { state: "unreachable"; reason: string }
  | { state: "code-refused"; error: string }
  | Session;

export function App() {
  let core: string;
  try {
    core = coreOrigin(location.href);
  } catch (error) {
    return <Unreachable reason={String(error)} />;
  }
  return <Hub core={core} />;
}

function Hub({ core }: { core: string }) {
  // Read once, since the effect below takes the code out of the address bar.
  const [intro] = useState(() => introCode(location.href));
  const [screen, setScreen] = useState<Screen>({ state: "checking" });

  useEffect(() => {
    let current = true;
    if (intro === undefined) {
      void getSession(core).then((result) => {
        if (!current) return;
        setScreen(
          result.ok
            ? result.value
            : { state: "unreachable", reason: result.error },
        );
      });
    } else {
      // An intro link signs the guest in once; a reload shouldn't send the
      // code again, and it shouldn't stay in the address bar.
      history.replaceState(null, "", "/");
      void signInWithCode(core, intro).then((result) => {
        if (!current) return;
        setScreen(
          result.ok
            ? result.value
            : { state: "code-refused", error: result.error },
        );
      });
    }
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
          <Status dot="bg-neutral-300">Checking core…</Status>
        </Card>
      );
    case "unreachable":
      return <Unreachable reason={screen.reason} />;
    case "unclaimed":
      return <Setup core={core} onSession={onSignedIn} />;
    case "code-refused":
      return <SignIn core={core} onSession={onSignedIn} error={screen.error} />;
    case "signed-out":
      return <SignIn core={core} onSession={onSignedIn} />;
    case "signed-in":
      return (
        <Launcher core={core} viewer={screen.viewer} onSession={setScreen} />
      );
  }
}

function Unreachable({ reason }: { reason: string }) {
  return (
    <Card>
      <Status dot="bg-red-500">Core is unreachable</Status>
      <p className="mt-2 text-sm text-neutral-500">{reason}</p>
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
