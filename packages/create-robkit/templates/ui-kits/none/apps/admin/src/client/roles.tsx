import { useState, type SubmitEvent } from "react";
import { createRole, setRoleCodes, type Role } from "./access-api.ts";
import { CodePicker } from "./code-picker.tsx";
import type { Code } from "./codes-api.ts";
import { Button, Field, FormError } from "./ui.tsx";

type Sending =
  { state: "idle" } | { state: "sending" } | { state: "failed"; error: string };

export function Roles({
  core,
  roles,
  codes,
  onChange,
}: {
  core: string;
  roles: readonly Role[];
  codes: readonly Code[];
  onChange: () => Promise<void>;
}) {
  return (
    <section className="grid gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Roles</h1>
      <NewRoleForm core={core} codes={codes} onCreated={onChange} />
      <ul className="grid gap-3">
        {roles.map((role) => (
          <RoleRow
            key={role.id}
            core={core}
            role={role}
            codes={codes}
            onChange={onChange}
          />
        ))}
      </ul>
    </section>
  );
}

function NewRoleForm({
  core,
  codes,
  onCreated,
}: {
  core: string;
  codes: readonly Code[];
  onCreated: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Sending>({ state: "idle" });

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("role-name");
    setSending({ state: "sending" });
    const result = await createRole(core, {
      name: typeof name === "string" ? name : "",
      codeIds: [...picked],
    });
    if (!result.ok) {
      setSending({ state: "failed", error: result.error });
      return;
    }
    form.reset();
    setPicked(new Set());
    setSending({ state: "idle" });
    await onCreated();
  }

  return (
    <form
      aria-label="Create a role"
      onSubmit={(event) => void onSubmit(event)}
      className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold tracking-tight">Create a role</h2>
      <Field label="Role name" name="role-name" required maxLength={40} />
      <CodePicker codes={codes} picked={picked} onPick={setPicked} />
      <div>
        <Button
          look="primary"
          type="submit"
          disabled={sending.state === "sending"}
        >
          Create role
        </Button>
      </div>
      {sending.state === "failed" && <FormError>{sending.error}</FormError>}
    </form>
  );
}

function RoleRow({
  core,
  role,
  codes,
  onChange,
}: {
  core: string;
  role: Role;
  codes: readonly Code[];
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Set<string> | undefined>();
  const [sending, setSending] = useState<Sending>({ state: "idle" });
  const names = codes
    .filter((code) => role.codeIds.includes(code.id))
    .map((code) => code.name);

  async function save(codeIds: Set<string>) {
    setSending({ state: "sending" });
    const result = await setRoleCodes(core, role.id, [...codeIds]);
    if (!result.ok) {
      setSending({ state: "failed", error: result.error });
      return;
    }
    setSending({ state: "idle" });
    setEditing(undefined);
    await onChange();
  }

  return (
    <li
      aria-label={role.name}
      className="grid gap-3 rounded-xl border border-neutral-200 bg-white px-6 py-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-medium">{role.name}</h2>
          <p className="text-sm text-neutral-500">
            {names.length === 0 ? "No guests yet" : names.join(", ")}
          </p>
        </div>
        {editing === undefined && (
          <Button
            look="outline"
            type="button"
            onClick={() => {
              setEditing(new Set(role.codeIds));
            }}
          >
            Edit guests
          </Button>
        )}
      </div>
      {editing !== undefined && (
        <div className="grid gap-3">
          <CodePicker codes={codes} picked={editing} onPick={setEditing} />
          <div className="flex gap-2">
            <Button
              look="primary"
              type="button"
              disabled={sending.state === "sending"}
              onClick={() => void save(editing)}
            >
              Save guests
            </Button>
            <Button
              look="outline"
              type="button"
              onClick={() => {
                setEditing(undefined);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {sending.state === "failed" && <FormError>{sending.error}</FormError>}
    </li>
  );
}
