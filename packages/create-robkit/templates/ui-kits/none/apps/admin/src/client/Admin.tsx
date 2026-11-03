import {
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
  type SubmitEvent,
} from "react";
import { listApps, listRoles, type App, type Role } from "./access-api.ts";
import { Apps } from "./apps.tsx";
import {
  expiryAfter,
  introLink,
  listCodes,
  mintCode,
  revokeCode,
  type Code,
  type Standing,
} from "./codes-api.ts";
import { Roles } from "./roles.tsx";
import { Badge, Button, Cell, Field, FormError, Panel, Table } from "./ui.tsx";

type Listing =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "loaded"; codes: Code[] };

/** Everything the owner manages that hangs off codes: roles and apps. */
type Access =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "loaded"; roles: Role[]; apps: App[] };

type Sending =
  { state: "idle" } | { state: "sending" } | { state: "failed"; error: string };

export function Admin({ core }: { core: string }) {
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  const [access, setAccess] = useState<Access>({ state: "loading" });

  const reload = useCallback(async () => {
    const [codes, roles, apps] = await Promise.all([
      listCodes(core),
      listRoles(core),
      listApps(core),
    ]);
    setListing(
      codes.ok
        ? { state: "loaded", codes: codes.value }
        : { state: "failed", error: codes.error },
    );
    if (!roles.ok) setAccess({ state: "failed", error: roles.error });
    else if (!apps.ok) setAccess({ state: "failed", error: apps.error });
    else setAccess({ state: "loaded", roles: roles.value, apps: apps.value });
  }, [core]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="min-h-screen bg-muted/50 antialiased">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-6">
          <p className="text-sm font-semibold tracking-tight">robkit admin</p>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10">
        <MintForm core={core} onMinted={reload} />
        <section>
          <h1 className="text-lg font-semibold tracking-tight">Access codes</h1>
          <div className="mt-4">
            <Codes core={core} listing={listing} onChange={reload} />
          </div>
        </section>
        <AccessSections
          core={core}
          codes={listing.state === "loaded" ? listing.codes : []}
          access={access}
          onChange={reload}
        />
      </main>
    </div>
  );
}

function AccessSections({
  core,
  codes,
  access,
  onChange,
}: {
  core: string;
  codes: Code[];
  access: Access;
  onChange: () => Promise<void>;
}) {
  switch (access.state) {
    case "loading":
      return (
        <p className="text-sm text-muted-foreground">Loading roles and apps…</p>
      );
    case "failed":
      return <FormError>{access.error}</FormError>;
    case "loaded":
      return (
        <>
          <Roles
            core={core}
            roles={access.roles}
            codes={codes}
            onChange={onChange}
          />
          <Apps
            core={core}
            apps={access.apps}
            roles={access.roles}
            onChange={onChange}
          />
        </>
      );
  }
}

function MintForm({
  core,
  onMinted,
}: {
  core: string;
  onMinted: () => Promise<void>;
}) {
  const [sending, setSending] = useState<Sending>({ state: "idle" });

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const code = text(fields, "code").trim();
    const expiresAt = expiryAfter(text(fields, "last-day"));
    setSending({ state: "sending" });
    const result = await mintCode(core, {
      name: text(fields, "name"),
      ...(code && { code }),
      ...(expiresAt && { expiresAt }),
    });
    if (!result.ok) {
      setSending({ state: "failed", error: result.error });
      return;
    }
    form.reset();
    setSending({ state: "idle" });
    await onMinted();
  }

  return (
    <section>
      <Panel>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Mint a code</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give a guest the code, or send them its intro link.
          </p>
        </div>
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="mt-2 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto_auto]"
        >
          <Field label="Guest's name" name="name" required maxLength={80} />
          <Field
            label="Code"
            name="code"
            placeholder="Leave blank to generate one"
            autoComplete="off"
            spellCheck={false}
          />
          <Field
            label="Last day"
            name="last-day"
            type="date"
            min={localDay(new Date())}
          />
          <Button
            look="primary"
            type="submit"
            disabled={sending.state === "sending"}
          >
            Mint code
          </Button>
        </form>
        {sending.state === "failed" && <FormError>{sending.error}</FormError>}
      </Panel>
    </section>
  );
}

function Codes({
  core,
  listing,
  onChange,
}: {
  core: string;
  listing: Listing;
  onChange: () => Promise<void>;
}) {
  switch (listing.state) {
    case "loading":
      return <p className="text-sm text-muted-foreground">Loading codes…</p>;
    case "failed":
      return <FormError>{listing.error}</FormError>;
    case "loaded":
      return (
        <Table
          head={["Guest", "Code", "Intro link", "Works until", "Standing", ""]}
        >
          {listing.codes.map((code) => (
            <CodeRow
              key={code.id}
              core={core}
              code={code}
              onChange={onChange}
            />
          ))}
        </Table>
      );
  }
}

function CodeRow({
  core,
  code,
  onChange,
}: {
  core: string;
  code: Code;
  onChange: () => Promise<void>;
}) {
  const [revoking, setRevoking] = useState<Sending>({ state: "idle" });
  const link = introLink(core, code.code);

  async function revoke() {
    setRevoking({ state: "sending" });
    const result = await revokeCode(core, code.id);
    if (!result.ok) {
      setRevoking({ state: "failed", error: result.error });
      return;
    }
    await onChange();
  }

  return (
    <tr>
      <Cell look="strong">{code.name}</Cell>
      <Cell look="code">{code.code}</Cell>
      <Cell>
        <div className="flex items-center gap-2">
          <code
            data-testid="intro-link"
            className="font-mono text-xs text-foreground"
          >
            {link}
          </code>
          <CopyButton text={link} />
        </div>
      </Cell>
      <Cell>{code.expiresAt ? lastDayOf(code.expiresAt) : "No expiry"}</Cell>
      <Cell>
        <StandingBadge standing={code.standing} />
      </Cell>
      <Cell look="end">
        {code.standing === "live" && (
          <Button
            look="outline"
            type="button"
            disabled={revoking.state === "sending"}
            onClick={() => void revoke()}
          >
            Revoke
          </Button>
        )}
        {revoking.state === "failed" && <FormError>{revoking.error}</FormError>}
      </Cell>
    </tr>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      look="outline"
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
          }, 2000);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

const standingLook: Record<
  Standing,
  { label: string; look: ComponentProps<typeof Badge>["look"] }
> = {
  live: { label: "Live", look: "primary" },
  revoked: { label: "Revoked", look: "secondary" },
  expired: { label: "Expired", look: "destructive" },
  "local-only": { label: "Local only", look: "outline" },
};

function StandingBadge({ standing }: { standing: Standing }) {
  const { label, look } = standingLook[standing];
  return <Badge look={look}>{label}</Badge>;
}

/** The last day a code works, from the moment it stops working. */
function lastDayOf(expiresAt: Date): string {
  return new Date(expiresAt.getTime() - 1).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

/** A date input's `YYYY-MM-DD` for `date`, where the owner is. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
