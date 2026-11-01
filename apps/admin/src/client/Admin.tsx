import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import {
  expiryAfter,
  introLink,
  listCodes,
  mintCode,
  revokeCode,
  type Code,
  type Standing,
} from "./codes-api.ts";
import { Button, Field, FormError } from "./ui.tsx";

type Listing =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "loaded"; codes: Code[] };

type Sending =
  { state: "idle" } | { state: "sending" } | { state: "failed"; error: string };

export function Admin({ core }: { core: string }) {
  const [listing, setListing] = useState<Listing>({ state: "loading" });

  const reload = useCallback(async () => {
    const result = await listCodes(core);
    setListing(
      result.ok
        ? { state: "loaded", codes: result.value }
        : { state: "failed", error: result.error },
    );
  }, [core]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-950 antialiased">
      <header className="border-b border-neutral-200 bg-white">
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
      </main>
    </div>
  );
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
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">Mint a code</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Give a guest the code, or send them its intro link.
      </p>
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="mt-6 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto_auto]"
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
      {sending.state === "failed" && (
        <div className="mt-4">
          <FormError>{sending.error}</FormError>
        </div>
      )}
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
      return <p className="text-sm text-neutral-500">Loading codes…</p>;
    case "failed":
      return <FormError>{listing.error}</FormError>;
    case "loaded":
      return (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr>
                <Heading>Guest</Heading>
                <Heading>Code</Heading>
                <Heading>Intro link</Heading>
                <Heading>Works until</Heading>
                <Heading>Standing</Heading>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {listing.codes.map((code) => (
                <CodeRow
                  key={code.id}
                  core={core}
                  code={code}
                  onChange={onChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Heading({ children }: { children: string }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
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
      <td className="px-4 py-3 font-medium">{code.name}</td>
      <td className="px-4 py-3 font-mono">{code.code}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <code
            data-testid="intro-link"
            className="font-mono text-xs text-neutral-700"
          >
            {link}
          </code>
          <CopyButton text={link} />
        </div>
      </td>
      <td className="px-4 py-3 text-neutral-700">
        {code.expiresAt ? lastDayOf(code.expiresAt) : "No expiry"}
      </td>
      <td className="px-4 py-3">
        <StandingBadge standing={code.standing} />
      </td>
      <td className="px-4 py-3 text-right">
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
      </td>
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

const standingLook: Record<Standing, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-emerald-50 text-emerald-700" },
  revoked: { label: "Revoked", className: "bg-neutral-100 text-neutral-600" },
  expired: { label: "Expired", className: "bg-amber-50 text-amber-700" },
  "local-only": { label: "Local only", className: "bg-sky-50 text-sky-700" },
};

function StandingBadge({ standing }: { standing: Standing }) {
  const { label, className } = standingLook[standing];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
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
