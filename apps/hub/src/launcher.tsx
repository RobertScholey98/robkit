import { signOut, type Session, type Viewer } from "./core-api.ts";
import { useSend } from "./forms.tsx";
import { Button, FormError } from "./ui.tsx";

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
      </main>
    </div>
  );
}
