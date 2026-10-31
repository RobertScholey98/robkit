import { useEffect, useState } from "react";
import { coreOrigin } from "./core-origin.ts";

type CoreStatus =
  { state: "checking" } | { state: "up" } | { state: "down"; reason: string };

async function checkCore(): Promise<CoreStatus> {
  try {
    const res = await fetch(`${coreOrigin(location.href)}/status`, {
      credentials: "include",
    });
    return res.ok
      ? { state: "up" }
      : { state: "down", reason: `Core answered ${String(res.status)}.` };
  } catch (error) {
    return { state: "down", reason: String(error) };
  }
}

const dot = {
  checking: "bg-neutral-300",
  up: "bg-emerald-500",
  down: "bg-red-500",
};

export function App() {
  const [status, setStatus] = useState<CoreStatus>({ state: "checking" });

  useEffect(() => {
    void checkCore().then(setStatus);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 font-sans text-neutral-950 antialiased">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">robkit hub</p>
        <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className={`size-2 rounded-full ${dot[status.state]}`} />
          {status.state === "checking" && "Checking core…"}
          {status.state === "up" && "Core is up"}
          {status.state === "down" && "Core is unreachable"}
        </h1>
        {status.state === "down" && (
          <p className="mt-2 text-sm text-neutral-500">{status.reason}</p>
        )}
      </div>
    </main>
  );
}
