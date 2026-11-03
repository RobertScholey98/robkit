import { useState } from "react";
import {
  setAccess,
  type AccessRule,
  type App,
  type Role,
} from "./access-api.ts";
import { Button, Check, Choices, FormError, Panel } from "./ui.tsx";

type Sending =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "saved" }
  | { state: "failed"; error: string };

const kinds: { value: AccessRule["kind"]; label: string }[] = [
  { value: "open", label: "Anyone" },
  { value: "roles", label: "Guests with a role" },
  { value: "owner", label: "Only me" },
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
    <li aria-label={app.name}>
      <Panel>
        <h2 className="font-medium">{app.name}</h2>
        <Choices
          legend="Who can open it"
          name={`access-${app.slug}`}
          value={kind}
          options={kinds}
          onValueChange={setKind}
        />
        {kind === "roles" && (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-neutral-700">
              Roles
            </legend>
            <div className="flex flex-wrap gap-4">
              {roles.map((role) => (
                <Check
                  key={role.id}
                  checked={picked.has(role.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(picked);
                    if (checked) next.add(role.id);
                    else next.delete(role.id);
                    setPicked(next);
                  }}
                >
                  {role.name}
                </Check>
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
      </Panel>
    </li>
  );
}
