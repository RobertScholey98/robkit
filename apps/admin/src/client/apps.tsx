import { useState } from "react";
import {
  setAccess,
  type AccessRule,
  type App,
  type Role,
} from "./access-api.ts";
import { Button, FormError } from "./ui.tsx";

type Sending =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "saved" }
  | { state: "failed"; error: string };

const kinds: { kind: AccessRule["kind"]; label: string }[] = [
  { kind: "open", label: "Anyone" },
  { kind: "roles", label: "Guests with a role" },
  { kind: "owner", label: "Only me" },
];

export function Apps({
  core,
  apps,
  roles,
  onChange,
}: {
  core: string;
  apps: readonly App[];
  roles: readonly Role[];
  onChange: () => Promise<void>;
}) {
  return (
    <section className="grid gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Apps</h1>
      {apps.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Apps you add with robkit add show up here.
        </p>
      ) : (
        <ul className="grid gap-3">
          {apps.map((app) => (
            <AppRow
              key={app.slug}
              core={core}
              app={app}
              roles={roles}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AppRow({
  core,
  app,
  roles,
  onChange,
}: {
  core: string;
  app: App;
  roles: readonly Role[];
  onChange: () => Promise<void>;
}) {
  const [kind, setKind] = useState(app.access.kind);
  const [picked, setPicked] = useState<Set<string>>(
    new Set(app.access.kind === "roles" ? app.access.roles : []),
  );
  const [sending, setSending] = useState<Sending>({ state: "idle" });

  async function save() {
    const rule: AccessRule =
      kind === "roles" ? { kind, roles: [...picked] } : { kind };
    setSending({ state: "sending" });
    const result = await setAccess(core, app.slug, rule);
    if (!result.ok) {
      setSending({ state: "failed", error: result.error });
      return;
    }
    setSending({ state: "saved" });
    await onChange();
  }

  return (
    <li
      aria-label={app.name}
      className="grid gap-3 rounded-xl border border-neutral-200 bg-white px-6 py-4"
    >
      <h2 className="font-medium">{app.name}</h2>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-neutral-700">
          Who can open it
        </legend>
        <div className="flex flex-wrap gap-4">
          {kinds.map((choice) => (
            <label
              key={choice.kind}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name={`access-${app.slug}`}
                checked={kind === choice.kind}
                onChange={() => {
                  setKind(choice.kind);
                }}
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "roles" && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-neutral-700">
            Roles
          </legend>
          <div className="flex flex-wrap gap-4">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.has(role.id)}
                  onChange={(event) => {
                    const next = new Set(picked);
                    if (event.currentTarget.checked) next.add(role.id);
                    else next.delete(role.id);
                    setPicked(next);
                  }}
                />
                {role.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex items-center gap-3">
        <Button
          look="primary"
          type="button"
          disabled={sending.state === "sending"}
          onClick={() => void save()}
        >
          Save access
        </Button>
        {sending.state === "saved" && (
          <p role="status" className="text-sm text-neutral-500">
            Saved. The app picks it up within a minute.
          </p>
        )}
      </div>
      {sending.state === "failed" && <FormError>{sending.error}</FormError>}
    </li>
  );
}
