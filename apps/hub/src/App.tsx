import { useEffect, useState } from "react";
import { getSession, type Session } from "./core-api.ts";
import { coreOrigin, returnTo } from "./core-origin.ts";
import { Setup, SignIn } from "./forms.tsx";
import { Launcher } from "./launcher.tsx";
import { Card } from "./ui.tsx";

type Screen =
  { state: "checking" } | { state: "unreachable"; reason: string } | Session;

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
  const [screen, setScreen] = useState<Screen>({ state: "checking" });

  useEffect(() => {
    void getSession(core).then((result) => {
      setScreen(
        result.ok
          ? result.session
          : { state: "unreachable", reason: result.error },
      );
    });
  }, [core]);

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
    case "signed-out":
      return <SignIn core={core} onSession={onSignedIn} />;
    case "signed-in":
      return (
        <Launcher core={core} owner={screen.viewer} onSession={setScreen} />
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
