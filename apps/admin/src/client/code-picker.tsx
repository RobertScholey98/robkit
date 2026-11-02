import type { Code } from "./codes-api.ts";
import { Button } from "./ui.tsx";

/**
 * Codes the owner can tick for a role: every code but the test code, which
 * holds every role anyway, and revoked ones, which no longer sign in.
 */
export function pickableCodes(codes: readonly Code[]): Code[] {
  return codes.filter(
    (code) => code.code !== "TEST" && code.standing !== "revoked",
  );
}

/** A checklist of guests' codes, with select all and deselect all. */
export function CodePicker({
  codes,
  picked,
  onPick,
}: {
  codes: readonly Code[];
  picked: ReadonlySet<string>;
  onPick: (picked: Set<string>) => void;
}) {
  const choices = pickableCodes(codes);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    onPick(next);
  };

  return (
    <fieldset className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <legend className="text-sm font-medium text-neutral-700">Guests</legend>
        <div className="flex gap-2">
          <Button
            look="outline"
            type="button"
            onClick={() => {
              onPick(new Set(choices.map((code) => code.id)));
            }}
          >
            Select all
          </Button>
          <Button
            look="outline"
            type="button"
            onClick={() => {
              onPick(new Set());
            }}
          >
            Deselect all
          </Button>
        </div>
      </div>
      {choices.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Mint a code first, then give it roles here.
        </p>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {choices.map((code) => (
            <li key={code.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.has(code.id)}
                  onChange={(event) => {
                    toggle(code.id, event.currentTarget.checked);
                  }}
                />
                {code.name}
                <span className="font-mono text-xs text-neutral-500">
                  {code.code}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-neutral-500">
        The test code holds every role.
      </p>
    </fieldset>
  );
}
